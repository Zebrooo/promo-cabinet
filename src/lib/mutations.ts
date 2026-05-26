import type { Promo } from './schema';

export class DuplicateIdError extends Error {}
export class NotFoundError extends Error {}
export class ReorderMismatchError extends Error {}

/** Append a promo to the pool. Rejects a duplicate id. */
export function addPromo(promos: Promo[], promo: Promo): Promo[] {
  if (promos.some((p) => p.id === promo.id)) {
    throw new DuplicateIdError(`promo "${promo.id}" already exists`);
  }
  return [...promos, promo];
}

/** Replace a promo by id, preserving its queue position. */
export function updatePromo(promos: Promo[], id: string, next: Promo): Promo[] {
  const idx = promos.findIndex((p) => p.id === id);
  if (idx === -1) throw new NotFoundError(`promo "${id}" not found`);
  const copy = promos.slice();
  copy[idx] = next;
  return copy;
}

/** Remove a promo by id. */
export function removePromo(promos: Promo[], id: string): Promo[] {
  if (!promos.some((p) => p.id === id)) throw new NotFoundError(`promo "${id}" not found`);
  return promos.filter((p) => p.id !== id);
}

/** Append id to the queue if not already present (idempotent). */
export function enqueue(queue: string[], id: string): string[] {
  return queue.includes(id) ? queue : [...queue, id];
}

/** Remove id from the queue (idempotent). */
export function dequeue(queue: string[], id: string): string[] {
  return queue.filter((q) => q !== id);
}

/** Reorder the queue to match `ids`, which must be a permutation of the current ids. */
export function reorderQueue(queue: string[], ids: string[]): string[] {
  const sameLength = ids.length === queue.length;
  const sameSet = new Set(ids).size === ids.length && ids.every((id) => queue.includes(id));
  if (!sameLength || !sameSet) {
    throw new ReorderMismatchError('ids must be a permutation of the current queue ids');
  }
  return [...ids];
}
