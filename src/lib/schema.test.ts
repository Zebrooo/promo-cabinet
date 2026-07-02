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

  it('accepts sections and categories', () => {
    const parsed = promoSchema.parse({ ...valid, sections: ['avto'], categories: ['kvartiry'] });
    expect(parsed.sections).toEqual(['avto']);
    expect(parsed.categories).toEqual(['kvartiry']);
  });

  it('accepts sellerStatus seller/buyer and rejects others', () => {
    expect(promoSchema.parse({ ...valid, sellerStatus: 'seller' }).sellerStatus).toBe('seller');
    expect(promoSchema.parse({ ...valid, sellerStatus: 'buyer' }).sellerStatus).toBe('buyer');
    expect(() => promoSchema.parse({ ...valid, sellerStatus: 'nope' })).toThrow();
  });

  it('round-trips a full targeting block', () => {
    const parsed = promoSchema.parse({ ...valid, targeting: { minAge: 18, maxAge: 35, regions: ['sukhum'], subscriptionLevels: ['plus'] } });
    expect(parsed.targeting).toEqual({ minAge: 18, maxAge: 35, regions: ['sukhum'], subscriptionLevels: ['plus'] });
  });

  it('accepts a tooltip promo with an anchor', () => {
    expect(() =>
      promoSchema.parse({
        id: 'tt', name: 'TT', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {}, cooldownHours: 0, format: 'tooltip', title: 'T', anchor: 'home-search',
      }),
    ).not.toThrow();
  });

  it('rejects a tooltip promo without an anchor', () => {
    expect(() =>
      promoSchema.parse({
        id: 'tt', name: 'TT', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {}, cooldownHours: 0, format: 'tooltip', title: 'T',
      }),
    ).toThrow();
  });

  it('does not require anchor for non-tooltip formats', () => {
    expect(() => promoSchema.parse({ ...valid, anchor: undefined })).not.toThrow();
  });
});

describe('multistep format (steps)', () => {
  const step = (n: number) => ({ title: `Шаг ${n}`, body: `Текст шага ${n}` });
  const multistep = {
    id: 'ms', name: 'MS', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
    targeting: {}, cooldownHours: 0, format: 'multistep', title: 'Онбординг',
  };

  it('accepts a multistep promo with 2 steps', () => {
    expect(() => promoSchema.parse({ ...multistep, steps: [step(1), step(2)] })).not.toThrow();
  });

  it('accepts a multistep promo with 6 steps', () => {
    const steps = Array.from({ length: 6 }, (_, i) => step(i + 1));
    expect(() => promoSchema.parse({ ...multistep, steps })).not.toThrow();
  });

  it('rejects a multistep promo without steps (refine, как anchor у tooltip)', () => {
    expect(() => promoSchema.parse(multistep)).toThrow();
  });

  it('rejects fewer than 2 steps', () => {
    expect(() => promoSchema.parse({ ...multistep, steps: [step(1)] })).toThrow();
    expect(() => promoSchema.parse({ ...multistep, steps: [] })).toThrow();
  });

  it('rejects more than 6 steps', () => {
    const steps = Array.from({ length: 7 }, (_, i) => step(i + 1));
    expect(() => promoSchema.parse({ ...multistep, steps })).toThrow();
  });

  it('rejects a step with an empty title or body', () => {
    expect(() => promoSchema.parse({ ...multistep, steps: [{ title: '', body: 'x' }, step(2)] })).toThrow();
    expect(() => promoSchema.parse({ ...multistep, steps: [{ title: 'x', body: '' }, step(2)] })).toThrow();
  });

  it('rejects a step title over 80 chars and body over 240 chars', () => {
    expect(() => promoSchema.parse({ ...multistep, steps: [{ title: 'т'.repeat(81), body: 'x' }, step(2)] })).toThrow();
    expect(() => promoSchema.parse({ ...multistep, steps: [{ title: 'x', body: 'т'.repeat(241) }, step(2)] })).toThrow();
    expect(() =>
      promoSchema.parse({ ...multistep, steps: [{ title: 'т'.repeat(80), body: 'т'.repeat(240) }, step(2)] }),
    ).not.toThrow();
  });

  it('does not require steps for non-multistep formats', () => {
    expect(() => promoSchema.parse(valid)).not.toThrow();
  });

  it('steps on a non-multistep format still validate the 2..6 bound', () => {
    expect(() => promoSchema.parse({ ...valid, steps: [step(1)] })).toThrow();
  });
});

describe('afterPromoId (цепочка показов)', () => {
  it('accepts a promo with afterPromoId', () => {
    const parsed = promoSchema.parse({ ...valid, afterPromoId: 'intro-step-1' });
    expect(parsed.afterPromoId).toBe('intro-step-1');
  });

  it('accepts a promo without afterPromoId (optional)', () => {
    expect(promoSchema.parse(valid).afterPromoId).toBeUndefined();
  });

  it('rejects an empty afterPromoId', () => {
    expect(() => promoSchema.parse({ ...valid, afterPromoId: '' })).toThrow();
  });

  it('rejects an afterPromoId longer than 64 chars', () => {
    expect(() => promoSchema.parse({ ...valid, afterPromoId: 'x'.repeat(65) })).toThrow();
    expect(() => promoSchema.parse({ ...valid, afterPromoId: 'x'.repeat(64) })).not.toThrow();
  });

  it('rejects a self-referencing afterPromoId (chain sanity)', () => {
    expect(() => promoSchema.parse({ ...valid, afterPromoId: valid.id })).toThrow();
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
