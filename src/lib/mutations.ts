import type { Promo } from './schema';

export class DuplicateIdError extends Error {}
export class NotFoundError extends Error {}
export class ReorderMismatchError extends Error {}

/** Append a promo to the end of the queue. Rejects a duplicate id. */
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

/** Reorder the queue to match `ids`, which must be a permutation of the current ids. */
export function reorderPromos(promos: Promo[], ids: string[]): Promo[] {
  const current = promos.map((p) => p.id);
  const sameLength = ids.length === current.length;
  const sameSet = new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!sameLength || !sameSet) {
    throw new ReorderMismatchError('ids must be a permutation of the current promo ids');
  }
  const byId = new Map(promos.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)!);
}
