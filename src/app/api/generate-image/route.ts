/**
 * Cabinet → BFF proxy для text-to-image генерации. Поток:
 *
 *   browser POST { prompt, width, height, format? } →
 *   /api/generate-image authenticates cookie + подписывает service-ticket →
 *   POST BFF /generate-banner-image →
 *   получаем base64 data URL →
 *   декодируем + кладём в S3 под promo-uploads/<date>/<uuid>.png →
 *   возвращаем { url: '/api/img/...' }
 *
 * Размеры — `format` ↦ предустановленные dimensions (popup/banner/full).
 * Если width+height передан явно — используем их.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createPrivateKey, sign as edSign, randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { isAuthed } from '@/lib/api-auth';
import { env } from '@/env';
import { getS3Client } from '@/lib/s3';
import { resolvePublicUploadUrl } from '@/lib/upload-url';
import { reportErrorToBff } from '@/lib/bff-client';

export const runtime = 'nodejs';
export const maxDuration = 60; // image-gen может занимать 20-40сек

// Размеры по форматам — должны совпадать с FORMAT_PREVIEW в кабинете.
const FORMAT_DIMS: Record<string, { w: number; h: number }> = {
  popup:      { w: 600,  h: 800  },
  fullscreen: { w: 1200, h: 1600 },
  inline:     { w: 600,  h: 400  },
  topline:    { w: 1200, h: 120  },
};

const TICKET_PREFIX = 'st1';
function loadPrivate(b64: string) {
  return createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
}
function issueTicket(): string {
  const pk = process.env.PROMO_TICKET_PRIVATE_KEY ?? '';
  if (!pk) throw new Error('PROMO_TICKET_PRIVATE_KEY not configured');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 90;
  const payload = {
    src: process.env.PROMO_TICKET_SRC ?? 'promo-cabinet',
    dst: process.env.PROMO_TICKET_DST ?? 'promo-bff',
    iat, exp,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${TICKET_PREFIX}.${body}`;
  const sig = edSign(null, Buffer.from(signingInput), loadPrivate(pk)).toString('base64url');
  return `${signingInput}.${sig}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { prompt?: string; width?: number; height?: number; format?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const prompt = (body.prompt ?? '').trim();
  if (prompt.length < 4) return NextResponse.json({ error: 'prompt_too_short' }, { status: 400 });

  const dims = body.format && FORMAT_DIMS[body.format]
    ? FORMAT_DIMS[body.format]
    : { w: body.width ?? 600, h: body.height ?? 800 };

  // 1) Call BFF
  const bffUrl = process.env.PROMO_BFF_URL ?? 'http://127.0.0.1:3191';
  let bffResp: Response;
  try {
    bffResp = await fetch(`${bffUrl}/generate-banner-image`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-ticket': issueTicket(),
      },
      body: JSON.stringify({
        advertiserId: env.adminUser || 'cabinet',
        prompt,
        width:  dims.w,
        height: dims.h,
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return NextResponse.json({ error: 'ai_timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'ai_unavailable' }, { status: 502 });
  }

  if (bffResp.status === 401) return NextResponse.json({ error: 'ai_unauthorized' }, { status: 502 });
  const json = (await bffResp.json().catch(() => ({}))) as {
    status?: 'ok' | 'error';
    reason?: string;
    data?: { imageDataUrl?: string; model?: string };
  };
  if (json.status === 'error') {
    return NextResponse.json({ error: json.reason ?? 'ai_unavailable' }, { status: 502 });
  }
  const dataUrl = json.data?.imageDataUrl;
  if (!dataUrl?.startsWith('data:image/')) {
    return NextResponse.json({ error: 'malformed_response' }, { status: 502 });
  }

  // 2) Decode + upload to S3
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) return NextResponse.json({ error: 'malformed_response' }, { status: 502 });
  const mime = match[1];
  const buf  = Buffer.from(match[2], 'base64');
  const ext  = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const dateDir = new Date().toISOString().slice(0, 10);
  const key = `${env.promoKeyPrefix}promo-uploads/${dateDir}/${randomUUID()}.${ext}`;

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.promoBucket,
        Key: key,
        Body: buf,
        ContentType: mime,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  } catch (err) {
    console.error('[generate-image] S3 put failed', err);
    void reportErrorToBff({ service: 'promo-cabinet', source: 'server', message: err instanceof Error ? err.message : String(err), errorType: err instanceof Error ? err.name : null, stack: err instanceof Error ? (err.stack ?? null) : null, route: '/api/generate-image' }).catch(() => {});
    return NextResponse.json({ error: 's3_unavailable' }, { status: 502 });
  }

  // Был relative `/api/img/...` — потребители очереди (abkhaz-auto) грузили
  // его относительно СВОЕГО origin'а и получали 404. Теперь absolute через
  // тот же helper, что в /api/upload.
  return NextResponse.json({
    url: resolvePublicUploadUrl(key, req),
    model: json.data?.model,
  }, { status: 200 });
}
