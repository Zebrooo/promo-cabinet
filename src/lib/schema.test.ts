import { describe, expect, it } from 'vitest';
import { promoSchema, catalogueSchema, queueSchema, audienceSchema, type Promo } from './schema';

const valid: Promo = {
  id: 'summer-sale',
  name: 'Summer Sale',
  startsAt: '2024-01-01T00:00:00.000Z',
  endsAt: '2024-12-31T00:00:00.000Z',
  targeting: { minAge: 18, regions: ['ru'], subscriptionLevels: ['plus'] },
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
        targeting: {}, cooldownHours: 0, format: 'topline', title: 'T',
      }),
    ).not.toThrow();
  });

  it('rejects an action without href', () => {
    expect(() => promoSchema.parse({ ...valid, action: { label: 'x' } })).toThrow();
  });

  it('accepts a positive maxImpressionsPerUser cap', () => {
    expect(() => promoSchema.parse({ ...valid, maxImpressionsPerUser: 5 })).not.toThrow();
  });

  it('accepts an omitted maxImpressionsPerUser (unlimited)', () => {
    const { maxImpressionsPerUser, ...rest } = valid as Promo & { maxImpressionsPerUser?: number };
    void maxImpressionsPerUser;
    expect(() => promoSchema.parse(rest)).not.toThrow();
  });

  it('coerces legacy maxImpressionsPerUser: 0 to undefined (unlimited)', () => {
    const parsed = promoSchema.parse({ ...valid, maxImpressionsPerUser: 0 });
    expect(parsed.maxImpressionsPerUser).toBeUndefined();
  });

  it('rejects a negative maxImpressionsPerUser', () => {
    expect(() => promoSchema.parse({ ...valid, maxImpressionsPerUser: -2 })).toThrow();
  });
});

describe('audience field', () => {
  it('accepts a promo with audience: authenticated', () => {
    expect(() => promoSchema.parse({ ...valid, audience: 'authenticated' })).not.toThrow();
  });

  it('accepts a promo with audience: anonymous', () => {
    expect(() => promoSchema.parse({ ...valid, audience: 'anonymous' })).not.toThrow();
  });

  it('accepts a promo with audience: all', () => {
    expect(() => promoSchema.parse({ ...valid, audience: 'all' })).not.toThrow();
  });

  it('accepts a promo without audience (optional)', () => {
    const { ...rest } = valid;
    expect(() => promoSchema.parse(rest)).not.toThrow();
  });

  it('rejects audience: nope', () => {
    expect(() => promoSchema.parse({ ...valid, audience: 'nope' })).toThrow();
  });
});

describe('audienceSchema', () => {
  it('accepts all, authenticated, anonymous', () => {
    expect(() => audienceSchema.parse('all')).not.toThrow();
    expect(() => audienceSchema.parse('authenticated')).not.toThrow();
    expect(() => audienceSchema.parse('anonymous')).not.toThrow();
  });

  it('rejects unknown values', () => {
    expect(() => audienceSchema.parse('nope')).toThrow();
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

describe('queueSchema', () => {
  it('accepts an array of id strings and rejects non-strings', () => {
    expect(() => queueSchema.parse(['a', 'b'])).not.toThrow();
    expect(() => queueSchema.parse(['a', 2])).toThrow();
  });
});
