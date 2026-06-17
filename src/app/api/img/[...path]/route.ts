/**
 * Public image proxy: cabinet → S3 → browser. Stream-and-cache.
 *
 * Бакет `config` приватный (bucket.ru игнорит ACL public-read), поэтому
 * прямого CDN-URL нет. Этот роут читает объект с креденшелами cabinet'а и
 * отдаёт байты с Cache-Control immutable (загруженные ключи никогда не
 * перезаписываются — UUID в имени).
 *
 * Path-параметр `[...path]` = полный ключ внутри бакета. Допустимы только
 * ключи под `promo-uploads/`, чтобы proxy не превратился в дырку для чтения
 * caталога / queue-файлов.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { getS3Client } from '@/lib/s3';
import { reportErrorToBff } from '@/lib/bff-client';

export const runtime = 'nodejs';

// Разрешённые префиксы — расширяемый список. promo-uploads/ — картинки,
// promo-divkit/ — DivKit JSON-верстки. Не пускаем «голые» ключи каталога
// типа promos.json / queue-*.json — они приватные.
const ALLOWED_PREFIXES = ['promo-uploads/', 'promo-divkit/'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = (env.promoKeyPrefix ?? '') + (path?.join('/') ?? '');

  // Guard: только разрешённый префикс. Иначе можно было бы стянуть promos.json
  // — что небезопасно (содержит структуру каталога, статистику и т.д.).
  const relKey = key.startsWith(env.promoKeyPrefix ?? '')
    ? key.slice((env.promoKeyPrefix ?? '').length)
    : key;
  if (!ALLOWED_PREFIXES.some((p) => relKey.startsWith(p))) {
    return new NextResponse('not_found', { status: 404 });
  }

  try {
    const r = await getS3Client().send(
      new GetObjectCommand({ Bucket: env.promoBucket, Key: key }),
    );
    if (!r.Body) return new NextResponse('not_found', { status: 404 });

    const stream = r.Body as ReadableStream<Uint8Array> & { transformToWebStream?: () => ReadableStream };
    const webStream = stream.transformToWebStream ? stream.transformToWebStream() : stream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': r.ContentType ?? 'application/octet-stream',
        ...(r.ContentLength ? { 'Content-Length': String(r.ContentLength) } : {}),
        // Загруженные ключи иммутабельны (UUID в имени) — кэшируем агрессивно.
        'Cache-Control': 'public, max-age=31536000, immutable',
        // CORS разрешён для всех — картинки могут грузить abkhaz-auto и любой
        // другой консьюмер каталога.
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
      return new NextResponse('not_found', { status: 404 });
    }
    console.error('[img proxy] S3 get failed', err);
    void reportErrorToBff({ service: 'promo-cabinet', source: 'server', message: err instanceof Error ? err.message : String(err), errorType: err instanceof Error ? err.name : null, stack: err instanceof Error ? (err.stack ?? null) : null, route: '/api/img/[...path]' }).catch(() => {});
    return new NextResponse('s3_unavailable', { status: 502 });
  }
}
