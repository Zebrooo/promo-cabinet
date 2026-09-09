import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { promosKey, queuesIndexKey, queueKey, legacyQueueKey, getS3Client, isNoSuchKey } from './s3';
import { promoSchema, queueSchema, queuesIndexSchema, queueObjectSchema, type Promo, type QueueObject, type QueuesIndex } from './schema';
import type { EnvMode } from './env-mode';
import { withCatalogueLock } from './catalogue-lock';
import { CANONICAL_QUEUES } from './catalogue-consts';

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

/** Plain (unconditional) PUT — the bucket.ru backend has no conditional writes;
 *  конкурентные мутации сериализует catalogue-lock.ts. */
async function writeJson(key: string, value: unknown): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({ Bucket: env.promoBucket, Key: key, Body: JSON.stringify(value, null, 2), ContentType: 'application/json' }),
  );
}

/**
 * Читает пул ПОШТУЧНО: одно битое промо не должно валить чтение всего каталога
 * (иначе весь кабинет показывает «Не удалось прочитать данные из S3» — инцидент
 * 2026-07-03: custom-промо без title завалило `catalogueSchema.parse` на весь массив).
 * Невалидные записи пропускаются с `console.warn`, валидные возвращаются. Тот же
 * подход, что в promo-bff config-service (аудит B4).
 */
export async function readPool(envMode: EnvMode = 'prod'): Promise<Promo[]> {
  const text = await readText(promosKey(envMode));
  if (text === null) return [];
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) {
    console.warn('[readPool] promos.json is not an array — treating as empty', { type: typeof raw });
    return [];
  }
  const out: Promo[] = [];
  for (const item of raw) {
    const res = promoSchema.safeParse(item);
    if (res.success) out.push(res.data);
    else {
      const promoId = (item as { id?: unknown } | null)?.id;
      console.warn('[readPool] skipping invalid promo', { promoId, issues: res.error.issues });
    }
  }
  return out;
}
export async function writePool(promos: Promo[], envMode: EnvMode = 'prod'): Promise<void> {
  await writeJson(promosKey(envMode), promos);
}

/** Read-modify-write the pool под локом окружения (см. catalogue-lock.ts).
 *  A domain error in `apply` propagates before any write. */
export function mutatePool(apply: (promos: Promo[]) => Promo[], envMode: EnvMode = 'prod'): Promise<Promo[]> {
  return withCatalogueLock(envMode, async () => {
    const next = apply(await readPool(envMode));
    await writePool(next, envMode);
    return next;
  });
}

/** Named-queues index: array of { name, persist }. Missing → []. */
export async function readQueuesIndex(envMode: EnvMode = 'prod'): Promise<QueuesIndex> {
  const text = await readText(queuesIndexKey(envMode));
  return text === null ? [] : queuesIndexSchema.parse(JSON.parse(text));
}
export async function writeQueuesIndex(idx: QueuesIndex, envMode: EnvMode = 'prod'): Promise<void> {
  await writeJson(queuesIndexKey(envMode), idx);
}

/** Per-queue object. Missing → { persist: false, ids: [] }. */
export async function readQueue(name: string, envMode: EnvMode = 'prod'): Promise<QueueObject> {
  const text = await readText(queueKey(name, envMode));
  return text === null ? { persist: false, ids: [] } : queueObjectSchema.parse(JSON.parse(text));
}
export async function writeQueue(name: string, obj: QueueObject, envMode: EnvMode = 'prod'): Promise<void> {
  await writeJson(queueKey(name, envMode), obj);
}

/** Read-modify-write a named queue под локом окружения (см. catalogue-lock.ts). */
export function mutateQueue(name: string, apply: (q: QueueObject) => QueueObject, envMode: EnvMode = 'prod'): Promise<QueueObject> {
  return withCatalogueLock(envMode, async () => {
    const next = apply(await readQueue(name, envMode));
    await writeQueue(name, next, envMode);
    return next;
  });
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
// Константы (очереди витрины, якоря) — в catalogue-consts.ts без серверных
// импортов; здесь реэкспорт для серверного кода и тестов.
export {
  DEVICE_QUEUE_CATALOGS, QUEUE_DEVICES, DEVICE_QUEUES, CANONICAL_QUEUES, PROD_SERVED_QUEUES, CANONICAL_ANCHORS,
} from './catalogue-consts';

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
export async function ensureMainQueue(envMode: EnvMode = 'prod'): Promise<QueuesIndex> {
  let index = await readQueuesIndex(envMode);

  // First-run migration: if no index exists at all, seed `main` from the
  // legacy bare-array queue.json so we don't drop any pre-existing ids.
  // В test-режиме легаси-ключ лежит под тем же 'test/'-префиксом и почти
  // всегда пуст — миграция там просто создаст main с пустыми ids.
  if (index.length === 0) {
    const legacyText = await readText(legacyQueueKey(envMode));
    const ids = legacyText === null ? [] : queueSchema.parse(JSON.parse(legacyText));
    await writeQueue('main', { persist: false, ids }, envMode);
    index = [{ name: 'main', persist: false }];
    await writeQueuesIndex(index, envMode);
  }

  // Fill in any canonical queue the storefront expects but the cabinet
  // doesn't yet know about. We create the per-queue file with empty ids
  // and append to the index — the advertiser fills it from the cabinet UI.
  const known = new Set(index.map((q) => q.name));
  const toAdd = CANONICAL_QUEUES.filter((q) => !known.has(q.name));
  if (toAdd.length === 0) return index;

  for (const q of toAdd) {
    await writeQueue(q.name, { persist: q.persist, ids: [] }, envMode);
  }
  const next = [...index, ...toAdd];
  await writeQueuesIndex(next, envMode);
  return next;
}

/** Индекс + содержимое всех очередей одним вызовом (N параллельных GET). */
export async function readAllQueues(envMode: EnvMode = 'prod'): Promise<{ index: QueuesIndex; queues: Record<string, QueueObject> }> {
  const index = await readQueuesIndex(envMode);
  const objs = await Promise.all(index.map((q) => readQueue(q.name, envMode)));
  const queues = Object.fromEntries(index.map((q, i) => [q.name, objs[i]]));
  return { index, queues };
}

/** promoId → имена очередей, где оно стоит (общий хелпер страниц кабинета). */
export async function readMembership(envMode: EnvMode = 'prod'): Promise<{ queueNames: string[]; membership: Record<string, string[]> }> {
  const { index, queues } = await readAllQueues(envMode);
  const membership: Record<string, string[]> = {};
  for (const { name } of index) {
    for (const id of queues[name].ids) (membership[id] ??= []).push(name);
  }
  return { queueNames: index.map((q) => q.name), membership };
}

/** Both objects, for rendering pages. */
export async function readState(envMode: EnvMode = 'prod'): Promise<{ promos: Promo[]; queues: QueuesIndex }> {
  const [promos, queues] = await Promise.all([readPool(envMode), readQueuesIndex(envMode)]);
  return { promos, queues };
}
