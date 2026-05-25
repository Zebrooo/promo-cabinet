import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { catalogueKey, getS3Client, isNoSuchKey } from './s3';
import { catalogueSchema, type Promo } from './schema';

/** Reads catalogue.json. A missing object reads as an empty catalogue. */
export async function readCatalogue(): Promise<{ promos: Promo[] }> {
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({ Bucket: env.promoBucket, Key: catalogueKey() }),
    );
    const text = await res.Body!.transformToString();
    return { promos: catalogueSchema.parse(JSON.parse(text)) };
  } catch (err) {
    if (isNoSuchKey(err)) return { promos: [] };
    throw err;
  }
}

/**
 * Writes the catalogue with a plain (unconditional) PUT. The bucket.ru backend does
 * not implement conditional writes (If-Match → 501), so this is last-write-wins.
 */
export async function writeCatalogue(promos: Promo[]): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.promoBucket,
      Key: catalogueKey(),
      Body: JSON.stringify(promos, null, 2),
      ContentType: 'application/json',
    }),
  );
}

/**
 * Read-modify-write: read the current promos, apply the transform, write the result.
 * Last-write-wins — there is no optimistic-concurrency guard because the storage
 * backend has no conditional-write support. A domain error thrown by `apply`
 * (duplicate id, not found, …) propagates before any write happens.
 */
export async function mutateCatalogue(apply: (promos: Promo[]) => Promo[]): Promise<Promo[]> {
  const { promos } = await readCatalogue();
  const next = apply(promos);
  await writeCatalogue(next);
  return next;
}
