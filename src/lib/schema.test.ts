import { describe, expect, it } from 'vitest';
import { promoSchema, catalogueSchema, type Promo } from './schema';

const valid: Promo = {
  id: 'summer-sale',
  name: 'Summer Sale',
  startsAt: '2024-01-01T00:00:00.000Z',
  endsAt: '2024-12-31T00:00:00.000Z',
  targeting: { minAge: 18, regions: ['ru'], subscriptionLevels: ['plus'] },
  maxImpressionsPerUser: 3,
  cooldownHours: 24,
  format: 'popup',
  title: 'Распродажа',
  description: 'desc',
  imageUrl: 'https://cdn.example.com/x.png',
  action: { href: '/sale', label: 'Подробнее' },
  dismissible: true,
};

describe('promoSchema', () => {
  it('accepts a fully-valid promo', () => {
    expect(() => promoSchema.parse(valid)).not.toThrow();
  });

  it('accepts a minimal promo (only required fields)', () => {
    expect(() =>
      promoSchema.parse({
        id: 'p',
        name: 'P',
        startsAt: '2024-01-01T00:00:00.000Z',
        endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {},
        maxImpressionsPerUser: 0,
        cooldownHours: 0,
        format: 'inline',
        title: 'T',
      }),
    ).not.toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => promoSchema.parse({ ...valid, id: '' })).toThrow();
  });

  it('rejects endsAt before startsAt', () => {
    expect(() =>
      promoSchema.parse({ ...valid, startsAt: '2024-12-31T00:00:00.000Z', endsAt: '2024-01-01T00:00:00.000Z' }),
    ).toThrow();
  });

  it('rejects a negative cooldownHours', () => {
    expect(() => promoSchema.parse({ ...valid, cooldownHours: -1 })).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => promoSchema.parse({ ...valid, format: 'banner' })).toThrow();
  });

  it('accepts the topline format', () => {
    expect(() =>
      promoSchema.parse({
        id: 'tl', name: 'TL', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'topline', title: 'T',
      }),
    ).not.toThrow();
  });

  it('rejects an action without href', () => {
    expect(() => promoSchema.parse({ ...valid, action: { label: 'x' } })).toThrow();
  });
});

describe('catalogueSchema', () => {
  it('parses an ordered array and preserves order', () => {
    const parsed = catalogueSchema.parse([
      { ...valid, id: 'a' },
      { ...valid, id: 'b' },
    ]);
    expect(parsed.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
