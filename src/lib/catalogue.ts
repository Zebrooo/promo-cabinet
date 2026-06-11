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
 * Canonical queues the storefront sites (abkhaz-auto) ALWAYS read by name —
 * they are hard-coded in the consumer's slot wiring. The cabinet pre-creates
 * them so an advertiser never sees an "empty" UI just because the slot wasn't
 * pre-registered.
 *
 * Keep this list in sync with the consumer's promo-slots config. Adding a new
 * slot to the storefront means adding its queue name here (and only here —
 * the bootstrap will create the file + register it in queues.json idempotently).
 */
export const CANONICAL_QUEUES: { name: string; persist: boolean }[] = [
  { name: 'home-banner', persist: true  }, // abkhaz-auto topline (cookie-pinned banner)
  { name: 'home-popup',  persist: false }, // abkhaz-auto popup (rotates per visit)
  { name: 'tooltip',     persist: false }, // abkhaz-auto tooltip (anchored bubble; site requests this queue)
];

/**
 * Named tooltip anchors the storefront sites mark with data-promo-anchor="<id>".
 * Page-scoped: `pages` lists the page contexts where the anchor element exists,
 * so the BFF only serves a tooltip where its anchor is present (mirrors the
 * AD_PAGES/page-targeting model). The advertiser picks an id from this list in
 * the cabinet. Keep in sync with the consumer's data-promo-anchor markup.
 */
export const CANONICAL_ANCHORS: { id: string; label: string; pages: string[] }[] = [
  { id: 'home-search',     label: 'Поиск на главной',       pages: ['home'] },
  { id: 'listing-cta',     label: 'Кнопка на карточке',     pages: ['listing'] },
  { id: 'catalog-filters', label: 'Фильтры каталога',       pages: ['catalog'] },
];

/**
 * Ensure the cabinet has every queue the storefront expects.
 *
 * On a fresh bucket: migrates the legacy single `queue.json` into `main`
 * (preserving the ids), and ALSO creates every canonical queue listed above.
 * On an existing bucket: only fills in the canonical queues that aren't yet
 * registered in `queues.json` — already-present queues are left untouched
 * (no overwrite of their ids/persist). Safe to call on every page render.
 *
 * Returns the resulting index so callers don't re-read `queues.json` right after.
 */
export async function ensureMainQueue(): Promise<QueuesIndex> {
  let index = await readQueuesIndex();

  // First-run migration: if no index exists at all, seed `main` from the
  // legacy bare-array queue.json so we don't drop any pre-existing ids.
  if (index.length === 0) {
    const legacyText = await readText(legacyQueueKey());
    const ids = legacyText === null ? [] : queueSchema.parse(JSON.parse(legacyText));
    await writeQueue('main', { persist: false, ids });
    index = [{ name: 'main', persist: false }];
    await writeQueuesIndex(index);
  }

  // Fill in any canonical queue the storefront expects but the cabinet
  // doesn't yet know about. We create the per-queue file with empty ids
  // and append to the index — the advertiser fills it from the cabinet UI.
  const known = new Set(index.map((q) => q.name));
  const toAdd = CANONICAL_QUEUES.filter((q) => !known.has(q.name));
  if (toAdd.length === 0) return index;

  for (const q of toAdd) {
    await writeQueue(q.name, { persist: q.persist, ids: [] });
  }
  const next = [...index, ...toAdd];
  await writeQueuesIndex(next);
  return next;
}

/** Both objects, for rendering pages. */
export async function readState(): Promise<{ promos: Promo[]; queues: QueuesIndex }> {
  const [promos, queues] = await Promise.all([readPool(), readQueuesIndex()]);
  return { promos, queues };
}
