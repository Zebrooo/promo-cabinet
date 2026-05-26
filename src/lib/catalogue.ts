import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { promosKey, queueKey, getS3Client, isNoSuchKey } from './s3';
import { poolSchema, queueSchema, type Promo } from './schema';

/** A missing object reads as null. */
async function readText(key: string): Promise<string | null> {
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: env.promoBucket, Key: key }));
    return await res.Body!.transformToString();
  } catch (err) {
    if (isNoSuchKey(err)) return null;
    throw err;
  }
}

/** Plain (unconditional) PUT — the bucket.ru backend has no conditional writes (last-write-wins). */
async function writeJson(key: string, value: unknown): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({ Bucket: env.promoBucket, Key: key, Body: JSON.stringify(value, null, 2), ContentType: 'application/json' }),
  );
}

export async function readPool(): Promise<Promo[]> {
  const text = await readText(promosKey());
  return text === null ? [] : poolSchema.parse(JSON.parse(text));
}
export async function writePool(promos: Promo[]): Promise<void> {
  await writeJson(promosKey(), promos);
}

export async function readQueue(): Promise<string[]> {
  const text = await readText(queueKey());
  return text === null ? [] : queueSchema.parse(JSON.parse(text));
}
export async function writeQueue(ids: string[]): Promise<void> {
  await writeJson(queueKey(), ids);
}

/** Read-modify-write the pool (last-write-wins). A domain error in `apply` propagates before any write. */
export async function mutatePool(apply: (promos: Promo[]) => Promo[]): Promise<Promo[]> {
  const next = apply(await readPool());
  await writePool(next);
  return next;
}

/** Read-modify-write the queue (last-write-wins). */
export async function mutateQueue(apply: (ids: string[]) => string[]): Promise<string[]> {
  const next = apply(await readQueue());
  await writeQueue(next);
  return next;
}

/** Both objects, for rendering pages. */
export async function readState(): Promise<{ promos: Promo[]; queue: string[] }> {
  const [promos, queue] = await Promise.all([readPool(), readQueue()]);
  return { promos, queue };
}
