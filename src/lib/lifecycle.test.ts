import { describe, expect, it } from 'vitest';
import { compactLifecycle } from './lifecycle';
import type { Promo } from './schema';

const base = {
  id: 'p', name: 'P', title: 'T',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-02-01T00:00:00.000Z',
  targeting: {}, cooldownHours: 0, format: 'inline',
} as Promo;

describe('compactLifecycle', () => {
  it('keeps a promo without lifecycle untouched', () => {
    expect(compactLifecycle(base)).toBe(base);
  });

  it('drops undefined-valued keys, keeps the defined ones', () => {
    const out = compactLifecycle({
      ...base,
      lifecycle: { soldWithinDays: 14, activeInCategories: undefined },
    });
    expect(out.lifecycle).toEqual({ soldWithinDays: 14 });
    expect(JSON.parse(JSON.stringify(out.lifecycle))).not.toHaveProperty('activeInCategories');
  });

  it('collapses {} and an all-undefined block to undefined (ключа нет в JSON)', () => {
    expect(compactLifecycle({ ...base, lifecycle: {} }).lifecycle).toBeUndefined();
    expect(
      compactLifecycle({ ...base, lifecycle: { hasStalledActive: undefined } }).lifecycle,
    ).toBeUndefined();
  });

  it('keeps a fully-defined block as is', () => {
    const lifecycle = {
      activeInCategories: ['avto'], soldWithinDays: 14,
      hasStalledActive: true as const, firstListingWithinDays: 7,
    };
    expect(compactLifecycle({ ...base, lifecycle }).lifecycle).toEqual(lifecycle);
  });
});
