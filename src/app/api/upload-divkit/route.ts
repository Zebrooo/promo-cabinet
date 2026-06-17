/**
 * POST /api/upload-divkit — кладёт DivKit JSON-верстку промо в S3.
 *
 * Body: { json: object, promoId?: string }
 * Returns: { url: <абсолютный URL на JSON> }
 *
 * Ключ в S3: `promo-divkit/<yyyy-mm-dd>/<promoId-or-uuid>-<ts>.json`.
 * Timestamp в имени → каждая правка промо = новый файл (старые в CDN-кеше).
 *
 * URL — абсолютный через resolvePublicUploadUrl (cabinet domain или
 * PROMO_PUBLIC_BASE если задан), чтобы abkhaz-auto + другие потребители
 * могли загрузить JSON напрямую.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { isAuthed } from '@/lib/api-auth';
import { env } from '@/env';
import { getS3Client } from '@/lib/s3';
import { resolvePublicUploadUrl } from '@/lib/upload-url';
import { reportErrorToBff } from '@/lib/bff-client';

export const runtime = 'nodejs';

const MAX_BYTES = 200 * 1024; // 200 KB — DivKit-верстки обычно 5-30 КБ

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { json?: unknown; promoId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  if (!body.json || typeof body.json !== 'object') {
    return NextResponse.json({ error: 'json_required' }, { status: 400 });
  }
  const serialized = JSON.stringify(body.json);
  if (Buffer.byteLength(serialized, 'utf-8') > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', maxBytes: MAX_BYTES }, { status: 413 });
  }
  // Минимальная валидация формы — DivKit card должна иметь хотя бы log_id и states.
  // Полная schema-валидация (через @divkitframework/divkit-schema) — TODO.
  const root = body.json as { card?: { log_id?: unknown; states?: unknown } };
  if (!root.card || !Array.isArray(root.card.states)) {
    return NextResponse.json({ error: 'invalid_divkit_shape' }, { status: 400 });
  }

  const dateDir = new Date().toISOString().slice(0, 10);
  const slug    = (body.promoId ?? randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '-');
  const ts      = Date.now();
  const key     = `${env.promoKeyPrefix}promo-divkit/${dateDir}/${slug}-${ts}.json`;

  try {
    await getS3Client().send(new PutObjectCommand({
      Bucket: env.promoBucket,
      Key: key,
      Body: serialized,
      ContentType: 'application/json',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch (err) {
    console.error('[upload-divkit] S3 put failed', err);
    void reportErrorToBff({ service: 'promo-cabinet', source: 'server', message: err instanceof Error ? err.message : String(err), errorType: err instanceof Error ? err.name : null, stack: err instanceof Error ? (err.stack ?? null) : null, route: '/api/upload-divkit' }).catch(() => {});
    return NextResponse.json({ error: 's3_unavailable' }, { status: 502 });
  }

  return NextResponse.json({ url: resolvePublicUploadUrl(key, req) }, { status: 200 });
}
