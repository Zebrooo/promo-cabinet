/**
 * Сериализация мутаций каталога в S3.
 *
 * bucket.ru не поддерживает условные записи (If-Match/ETag), а все мутации —
 * read-modify-write целого JSON: два одновременных сохранения (две вкладки,
 * два админа, «сохранить» + «в очередь» подряд) молча затирают друг друга
 * last-write-wins. Кабинет работает одним процессом (один контейнер без
 * реплик), поэтому достаточно in-process очереди: мутации одного окружения
 * (prod/test) выполняются строго по одной.
 *
 * Лок реентерабельный через AsyncLocalStorage: обработчик, который уже держит
 * лок (например, DELETE промо, чистящий несколько очередей и пул), может звать
 * mutatePool/mutateQueue, не дожидаясь самого себя.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const held = new AsyncLocalStorage<ReadonlySet<string>>();
const tails = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = held.getStore();
  if (current?.has(key)) return fn();

  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;
  try {
    return await held.run(new Set([...(current ?? []), key]), fn);
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

export function catalogueLockKey(envMode: string): string {
  return `catalogue:${envMode}`;
}

/** Все мутации пула и очередей одного окружения — под одним локом. */
export function withCatalogueLock<T>(envMode: string, fn: () => Promise<T>): Promise<T> {
  return withLock(catalogueLockKey(envMode), fn);
}
