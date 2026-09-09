import { describe, expect, it } from 'vitest';
import type { Promo } from './schema';
import { copyPromoId, duplicatePromo } from './duplicate-promo';

const base: Promo = {
  id: 'summer-sale',
  name: 'Летняя акция',
  title: 'Скидки лета',
  startsAt: '2026-06-01T00:00:00.000Z',
  endsAt: '2026-08-31T00:00:00.000Z',
  targeting: { minAge: 18, geoSegments: ['tourist'] },
  cooldownHours: 12,
  maxImpressionsPerUser: 3,
  format: 'popup',
  description: 'До конца лета',
  action: { href: 'https://abkhaz-auto.ru/sale', label: 'Смотреть' },
  deviceTarget: 'touch',
};

describe('copyPromoId', () => {
  it('appends -copy when free', () => {
    expect(copyPromoId('summer-sale', ['summer-sale'])).toBe('summer-sale-copy');
  });

  it('numbers the copy when -copy is taken, skipping taken numbers', () => {
    expect(copyPromoId('summer-sale', ['summer-sale', 'summer-sale-copy'])).toBe('summer-sale-copy-2');
    expect(copyPromoId('summer-sale', ['summer-sale', 'summer-sale-copy', 'summer-sale-copy-2', 'summer-sale-copy-3']))
      .toBe('summer-sale-copy-4');
  });
});

describe('duplicatePromo', () => {
  it('keeps format, device, content, targeting and limits; changes id and name', () => {
    const copy = duplicatePromo(base, [base]);
    expect(copy.id).toBe('summer-sale-copy');
    expect(copy.name).toBe('Летняя акция (копия)');
    expect(copy.format).toBe('popup');
    expect(copy.deviceTarget).toBe('touch');
    expect(copy.title).toBe(base.title);
    expect(copy.action).toEqual(base.action);
    expect(copy.targeting).toEqual(base.targeting);
    expect(copy.cooldownHours).toBe(12);
    expect(copy.maxImpressionsPerUser).toBe(3);
  });

  it('does not mutate the source', () => {
    const snapshot = structuredClone(base);
    duplicatePromo(base, [base]);
    expect(base).toEqual(snapshot);
  });
});
