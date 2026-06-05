/**
 * Upload an image to the promo bucket. Cabinet → S3 directly, no BFF hop —
 * cabinet already имеет AWS creds (cвой S3 client в @/lib/s3).
 *
 * Поведение:
 *  - принимает multipart/form-data с полем `file`
 *  - валидирует Content-Type (image/* + size <= 5MB)
 *  - кладёт под `promo-uploads/<yyyy-mm-dd>/<uuid>.<ext>`
 *  - возвращает `{ url: <https-url-к-объекту> }`
 *
 * URL формируется как `${PUBLIC_S3_BASE}/${key}` — для bucket.ru это
 * `https://config.s3.buckets.ru/...`. Если в env есть `PROMO_PUBLIC_BASE`,
 * используем его (CDN/CloudFront/etc.), иначе деривируем из endpoint+bucket.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { isAuthed } from '@/lib/api-auth';
import { env } from '@/env';
import { getS3Client } from '@/lib/s3';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'unsupported_type', detail: file.type }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', maxBytes: MAX_BYTES, size: file.size }, { status: 413 });
  }

  const ext = extFor(file.type) ?? 'bin';
  const dateDir = new Date().toISOString().slice(0, 10); // 2026-06-05
  const key = `${env.promoKeyPrefix}promo-uploads/${dateDir}/${randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const s3 = getS3Client();
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.promoBucket,
        Key: key,
        Body: buf,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000, immutable',
        // bucket.ru поддерживает ACL public-read для прямой раздачи объекта
        ACL: 'public-read',
      }),
    );
  } catch (err) {
    console.error('[upload] S3 put failed', err);
    return NextResponse.json({ error: 's3_unavailable' }, { status: 502 });
  }

  return NextResponse.json({ url: publicUrlFor(key) }, { status: 200 });
}

function extFor(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png')  return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif')  return 'gif';
  if (mime === 'image/avif') return 'avif';
  return null;
}

function publicUrlFor(key: string): string {
  // Допускаем PROMO_PUBLIC_BASE override (CDN), иначе деривируем из endpoint.
  const publicBase = process.env.PROMO_PUBLIC_BASE;
  if (publicBase) return `${stripSlash(publicBase)}/${key}`;
  // bucket.ru: https://<bucket>.s3.buckets.ru/<key>
  if (env.s3Endpoint) {
    const host = env.s3Endpoint.replace(/^https?:\/\//, '');
    return `https://${env.promoBucket}.${host}/${key}`;
  }
  // AWS-style fallback
  return `https://${env.promoBucket}.s3.${env.awsRegion}.amazonaws.com/${key}`;
}
function stripSlash(s: string): string { return s.endsWith('/') ? s.slice(0, -1) : s; }
