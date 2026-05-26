import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { promosKey, queuesIndexKey, queueKey, legacyQueueKey, getS3Client, isNoSuchKey } from './s3';
import { poolSchema, queueSchema, queuesIndexSchema, queueObjectSchema, type Promo, type QueueObject, type QueuesIndex } from './schema';

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

/** Read-modify-write the pool (last-write-wins). A domain error in `apply` propagates before any write. */
export async function mutatePool(apply: (promos: Promo[]) => Promo[]): Promise<Promo[]> {
  const next = apply(await readPool());
  await writePool(next);
  return next;
}

/** Named-queues index: array of { name, persist }. Missing → []. */
export async function readQueuesIndex(): Promise<QueuesIndex> {
  const text = await readText(queuesIndexKey());
  return text === null ? [] : queuesIndexSchema.parse(JSON.parse(text));
}
export async function writeQueuesIndex(idx: QueuesIndex): Promise<void> {
  await writeJson(queuesIndexKey(), idx);
}

/** Per-queue object. Missing → { persist: false, ids: [] }. */
export async function readQueue(name: string): Promise<QueueObject> {
  const text = await readText(queueKey(name));
  return text === null ? { persist: false, ids: [] } : queueObjectSchema.parse(JSON.parse(text));
}
export async function writeQueue(name: string, obj: QueueObject): Promise<void> {
  await writeJson(queueKey(name), obj);
}

/** Read-modify-write a named queue (last-write-wins). */
export async function mutateQueue(name: string, apply: (q: QueueObject) => QueueObject): Promise<QueueObject> {
  const next = apply(await readQueue(name));
  await writeQueue(name, next);
  return next;
}

/**
 * Ensure the 'main' queue exists. If queues.json is missing or empty:
 * - Read legacy queue.json (bare id array, may be missing → [])
 * - Write queue-main.json = { persist: false, ids }
 * - Write queues.json = [{ name: 'main', persist: false }]
 */
export async function ensureMainQueue(): Promise<void> {
  const index = await readQueuesIndex();
  if (index.length > 0) return;

  // Read legacy bare id array
  const legacyText = await readText(legacyQueueKey());
  const ids = legacyText === null ? [] : queueSchema.parse(JSON.parse(legacyText));

  await writeQueue('main', { persist: false, ids });
  await writeQueuesIndex([{ name: 'main', persist: false }]);
}

/** Both objects, for rendering pages. */
export async function readState(): Promise<{ promos: Promo[]; queues: QueuesIndex }> {
  const [promos, queues] = await Promise.all([readPool(), readQueuesIndex()]);
  return { promos, queues };
}
