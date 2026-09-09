import type { Promo } from './schema';

/** Свободный id для копии: `<id>-copy`, занят — `<id>-copy-2`, `-copy-3`… */
export function copyPromoId(sourceId: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base = `${sourceId}-copy`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Черновик копии промо для формы создания: тот же формат, контент, таргетинг
 * и лимиты, новый id и пометка в названии. Формат и устройство после создания
 * менять нельзя, поэтому копия — единственный способ завести «такое же, но
 * другое» промо, не перебивая десятки полей руками. Очереди не копируются:
 * членство живёт отдельно от промо и назначается после первого сохранения.
 */
export function duplicatePromo(source: Promo, pool: readonly Promo[]): Promo {
  return {
    ...source,
    id: copyPromoId(source.id, pool.map((p) => p.id)),
    name: `${source.name} (копия)`,
  };
}
