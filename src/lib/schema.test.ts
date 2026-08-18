import { describe, expect, it } from 'vitest';
import {
  promoSchema,
  catalogueSchema,
  queueSchema,
  audienceSchema,
  CONTENT_KEYS_BY_FORMAT,
  purchasesTargetingSchema,
  balanceTargetingSchema,
  listingsTargetingSchema,
  type Promo,
} from './schema';
import { KNOWN_CUSTOM_VARIANTS } from './custom-variants';

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

describe('targeting.search', () => {
  const withSearch = (search: unknown) => ({
    ...valid,
    targeting: { search },
  });

  it('accepts and normalizes the complete search targeting contract', () => {
    const parsed = promoSchema.parse(withSearch({
      terms: ['  toyota camry  ', 'семейный автомобиль'],
      sections: [' avto ', 'moto'],
      match: 'all',
      lookbackDays: 14,
    }));

    expect(parsed.targeting.search).toEqual({
      terms: ['toyota camry', 'семейный автомобиль'],
      sections: ['avto', 'moto'],
      match: 'all',
      lookbackDays: 14,
    });
  });

  it('keeps match and lookback optional', () => {
    const parsed = promoSchema.parse(withSearch({ terms: ['toyota'] }));
    expect(parsed.targeting.search).toEqual({ terms: ['toyota'] });
  });

  it('accepts both match modes and rejects unknown values', () => {
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], match: 'any' }))).not.toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], match: 'all' }))).not.toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], match: 'some' }))).toThrow();
  });

  it('does not pass unknown nested fields through to storage', () => {
    const parsed = promoSchema.parse(withSearch({ terms: ['toyota'], unknownRule: true }));
    expect(parsed.targeting.search).not.toHaveProperty('unknownRule');
  });

  it('enforces the 1..30 integer lookback range', () => {
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], lookbackDays: 1 }))).not.toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], lookbackDays: 30 }))).not.toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], lookbackDays: 0 }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], lookbackDays: 31 }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['toyota'], lookbackDays: 1.5 }))).toThrow();
  });

  it('enforces phrase count and length limits', () => {
    expect(() => promoSchema.parse(withSearch({ terms: Array.from({ length: 20 }, () => 'aa') }))).not.toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: Array.from({ length: 21 }, () => 'aa') }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['a'] }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: [' '.repeat(2)] }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['--'] }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['C++'] }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ terms: ['a'.repeat(81)] }))).toThrow();
  });

  it('enforces search section count and length limits', () => {
    expect(() => promoSchema.parse(withSearch({ sections: Array.from({ length: 20 }, () => 'a') }))).not.toThrow();
    expect(() => promoSchema.parse(withSearch({ sections: Array.from({ length: 21 }, () => 'a') }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ sections: [' '] }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ sections: ['-'] }))).toThrow();
    expect(() => promoSchema.parse(withSearch({ sections: ['a'.repeat(41)] }))).toThrow();
  });
});

describe('purchasesTargetingSchema', () => {
  it('accepts an empty object', () => {
    expect(purchasesTargetingSchema.safeParse({}).success).toBe(true);
  });
  it('accepts a fully specified rule', () => {
    const result = purchasesTargetingSchema.safeParse({
      purchased: true,
      minTotalKopecks: 100000,
      packTypes: ['vip', 'bump'],
      lookbackDays: 60,
    });
    expect(result.success).toBe(true);
  });
  it('rejects an unknown pack type', () => {
    expect(purchasesTargetingSchema.safeParse({ packTypes: ['gold'] }).success).toBe(false);
  });
  it('rejects lookbackDays outside 1..365', () => {
    expect(purchasesTargetingSchema.safeParse({ lookbackDays: 0 }).success).toBe(false);
    expect(purchasesTargetingSchema.safeParse({ lookbackDays: 366 }).success).toBe(false);
  });
});

describe('balanceTargetingSchema', () => {
  it('accepts an empty object', () => {
    expect(balanceTargetingSchema.safeParse({}).success).toBe(true);
  });
  it('accepts negative movement thresholds (net spend)', () => {
    expect(balanceTargetingSchema.safeParse({ movementBelow: -50000 }).success).toBe(true);
  });
});

describe('listingsTargetingSchema', () => {
  it('accepts an empty object', () => {
    expect(listingsTargetingSchema.safeParse({}).success).toBe(true);
  });
  it('accepts a fully specified rule', () => {
    const result = listingsTargetingSchema.safeParse({
      categories: ['avto', 'realty'],
      categoriesMatch: 'all',
      activeCategories: ['avto'],
      hasUnpromotedActive: true,
      inactiveDays: 14,
    });
    expect(result.success).toBe(true);
  });
  it('accepts each optional field individually', () => {
    expect(listingsTargetingSchema.safeParse({ categories: ['avto'] }).success).toBe(true);
    expect(listingsTargetingSchema.safeParse({ categoriesMatch: 'any' }).success).toBe(true);
    expect(listingsTargetingSchema.safeParse({ activeCategories: ['realty'] }).success).toBe(true);
    expect(listingsTargetingSchema.safeParse({ hasUnpromotedActive: false }).success).toBe(true);
    expect(listingsTargetingSchema.safeParse({ inactiveDays: 0 }).success).toBe(true);
  });
  it('rejects an unknown categoriesMatch value', () => {
    expect(listingsTargetingSchema.safeParse({ categoriesMatch: 'both' }).success).toBe(false);
  });
  it('rejects an empty string in categories', () => {
    expect(listingsTargetingSchema.safeParse({ categories: [''] }).success).toBe(false);
  });
  it('rejects an empty string in activeCategories', () => {
    expect(listingsTargetingSchema.safeParse({ activeCategories: [''] }).success).toBe(false);
  });
  it('rejects a non-boolean hasUnpromotedActive', () => {
    expect(listingsTargetingSchema.safeParse({ hasUnpromotedActive: 'yes' }).success).toBe(false);
  });
  it('rejects a negative inactiveDays', () => {
    expect(listingsTargetingSchema.safeParse({ inactiveDays: -1 }).success).toBe(false);
  });
  it('rejects a non-integer inactiveDays', () => {
    expect(listingsTargetingSchema.safeParse({ inactiveDays: 1.5 }).success).toBe(false);
  });
});

describe('multistep format (steps)', () => {
  const step = (n: number) => ({ title: `Шаг ${n}`, body: `Текст шага ${n}` });
  const multistep = {
    id: 'ms', name: 'MS', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
    targeting: {}, cooldownHours: 0, format: 'multistep' as const, title: 'Онбординг',
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

  it('steps on a non-multistep format are stripped, not rejected (union member has no steps field)', () => {
    const parsed = promoSchema.parse({ ...valid, steps: [step(1)] });
    expect(parsed).not.toHaveProperty('steps');
  });

  it('accepts an optional per-step imageUrl (картинка/гифка шага)', () => {
    const parsed: Promo = promoSchema.parse({
      ...multistep,
      steps: [{ ...step(1), imageUrl: 'https://cdn.example.com/step-1.gif' }, step(2)],
    });
    expect(parsed.steps?.[0].imageUrl).toBe('https://cdn.example.com/step-1.gif');
    expect(parsed.steps?.[1].imageUrl).toBeUndefined();
  });

  it('rejects a step imageUrl that is not a URL', () => {
    expect(() =>
      promoSchema.parse({ ...multistep, steps: [{ ...step(1), imageUrl: 'not-a-url' }, step(2)] }),
    ).toThrow();
  });

  it('rejects a step imageUrl over 1024 chars (границы как в BFF)', () => {
    const long = `https://cdn.example.com/${'x'.repeat(1024)}.png`;
    expect(() =>
      promoSchema.parse({ ...multistep, steps: [{ ...step(1), imageUrl: long }, step(2)] }),
    ).toThrow();
    const max = `https://cdn.example.com/${'x'.repeat(1024 - 28)}.png`; // ровно 1024
    expect(max.length).toBe(1024);
    expect(() =>
      promoSchema.parse({ ...multistep, steps: [{ ...step(1), imageUrl: max }, step(2)] }),
    ).not.toThrow();
  });
});

describe('presentation (multistep: модалка / во весь экран)', () => {
  const step = (n: number) => ({ title: `Шаг ${n}`, body: `Текст шага ${n}` });
  const multistep = {
    id: 'ms-p', name: 'MS', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
    targeting: {}, cooldownHours: 0, format: 'multistep' as const, title: 'Онбординг',
    steps: [step(1), step(2)],
  };

  it('accepts a multistep promo with presentation: modal', () => {
    const parsed: Promo = promoSchema.parse({ ...multistep, presentation: 'modal' });
    expect(parsed.presentation).toBe('modal');
  });

  it('accepts a multistep promo with presentation: fullscreen', () => {
    const parsed: Promo = promoSchema.parse({ ...multistep, presentation: 'fullscreen' });
    expect(parsed.presentation).toBe('fullscreen');
  });

  it('accepts a multistep promo without presentation (optional, default modal у рендерера)', () => {
    const parsed: Promo = promoSchema.parse(multistep);
    expect(parsed.presentation).toBeUndefined();
  });

  it('rejects an unknown presentation value', () => {
    expect(() => promoSchema.parse({ ...multistep, presentation: 'sheet' })).toThrow();
  });

  it('presentation on a non-multistep format is stripped, not rejected (union member has no presentation field)', () => {
    expect(promoSchema.parse({ ...valid, presentation: 'fullscreen' })).not.toHaveProperty('presentation');
    expect(promoSchema.parse({ ...valid, presentation: 'modal' })).not.toHaveProperty('presentation');
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

describe('afterClickPromoId (цепочка по клику) и suppressAfterClick — волна C', () => {
  it('accepts a promo with afterClickPromoId', () => {
    const parsed = promoSchema.parse({ ...valid, afterClickPromoId: 'intro-step-1' });
    expect(parsed.afterClickPromoId).toBe('intro-step-1');
  });

  it('accepts a promo without afterClickPromoId (optional)', () => {
    expect(promoSchema.parse(valid).afterClickPromoId).toBeUndefined();
  });

  it('rejects an empty afterClickPromoId', () => {
    expect(() => promoSchema.parse({ ...valid, afterClickPromoId: '' })).toThrow();
  });

  it('rejects an afterClickPromoId longer than 64 chars', () => {
    expect(() => promoSchema.parse({ ...valid, afterClickPromoId: 'x'.repeat(65) })).toThrow();
    expect(() => promoSchema.parse({ ...valid, afterClickPromoId: 'x'.repeat(64) })).not.toThrow();
  });

  it('rejects a self-referencing afterClickPromoId (chain sanity)', () => {
    expect(() => promoSchema.parse({ ...valid, afterClickPromoId: valid.id })).toThrow();
  });

  it('accepts both chain fields together (BFF применяет их как И)', () => {
    const parsed = promoSchema.parse({ ...valid, afterPromoId: 'a', afterClickPromoId: 'a' });
    expect(parsed.afterPromoId).toBe('a');
    expect(parsed.afterClickPromoId).toBe('a');
  });

  it('accepts suppressAfterClick and keeps it optional', () => {
    expect(promoSchema.parse({ ...valid, suppressAfterClick: true }).suppressAfterClick).toBe(true);
    expect(promoSchema.parse(valid).suppressAfterClick).toBeUndefined();
  });

  it('rejects a non-boolean suppressAfterClick', () => {
    expect(() => promoSchema.parse({ ...valid, suppressAfterClick: 'yes' })).toThrow();
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

describe('custom format', () => {
  const base = {
    id: 'custom-test',
    name: 'Custom test',
    format: 'custom' as const,
    variant: 'reklama-onboarding' as const,
    title: 'Custom promo',
    startsAt: '2026-07-01T00:00:00.000Z',
    endsAt: '2027-07-01T00:00:00.000Z',
    targeting: {},
    cooldownHours: 0,
    maxImpressionsPerUser: 1,
    audience: 'authenticated' as const,
    deviceTarget: 'both' as const,
  };

  it('accepts a valid custom promo with a registered variant', () => {
    expect(promoSchema.safeParse(base).success).toBe(true);
  });

  it('rejects custom promo without variant', () => {
    const bad = { ...base, variant: undefined };
    const result = promoSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('variant'))).toBe(true);
    }
  });

  it('rejects custom promo with unregistered variant', () => {
    const bad = { ...base, variant: 'not-in-manifest' };
    const result = promoSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('variant'))).toBe(true);
    }
  });

  it('variant is ignored for non-custom formats (validation passes without variant)', () => {
    const multistep = {
      ...base,
      format: 'multistep' as const,
      variant: undefined,
      steps: [
        { title: 'a', body: 'b' },
        { title: 'c', body: 'd' },
      ],
    };
    expect(promoSchema.safeParse(multistep).success).toBe(true);
  });

  it('sanity: KNOWN_CUSTOM_VARIANTS has reklama-onboarding', () => {
    expect(KNOWN_CUSTOM_VARIANTS.some((v) => v.id === 'reklama-onboarding')).toBe(true);
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

describe('dead fields are stripped, not rejected (strip semantics of the union)', () => {
  it('popup with popupVariant/bullets parses, fields are stripped', () => {
    const parsed = promoSchema.parse({
      ...valid,
      format: 'popup' as const,
      popupVariant: 'split',
      bullets: ['a', 'b'],
    });
    expect(parsed).not.toHaveProperty('popupVariant');
    expect(parsed).not.toHaveProperty('bullets');
  });

  it('topline with backgroundGradient/textAlign parses, fields are stripped', () => {
    const parsed = promoSchema.parse({
      id: 'tl-dead', name: 'TL', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
      targeting: {}, cooldownHours: 0, format: 'topline' as const, title: 'T',
      backgroundGradient: { from: '#fff' },
      textAlign: 'center',
      imageUrl: 'https://cdn.example.com/x.png',
      ctaColor: '#000',
      ctaTextColor: '#fff',
    });
    expect(parsed).not.toHaveProperty('backgroundGradient');
    expect(parsed).not.toHaveProperty('textAlign');
    expect(parsed).not.toHaveProperty('imageUrl');
    expect(parsed).not.toHaveProperty('ctaColor');
    expect(parsed).not.toHaveProperty('ctaTextColor');
  });

  it('inline with backgroundGradient is stripped', () => {
    const parsed = promoSchema.parse({
      ...valid,
      format: 'inline' as const,
      backgroundGradient: { from: '#fff', to: '#000' },
    });
    expect(parsed).not.toHaveProperty('backgroundGradient');
  });
});

describe('regression shield: every format parses with all fields valid today', () => {
  const base = {
    id: 'fmt-x', name: 'Fmt', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-02-01T00:00:00.000Z',
    targeting: {
      minAge: 18,
      maxAge: 40,
      regions: ['ru'],
      subscriptionLevels: ['plus'] as const,
      search: { terms: ['toyota'], sections: ['avto'], match: 'any' as const, lookbackDays: 30 },
    },
    maxImpressionsPerUser: 3,
    cooldownHours: 12,
    afterPromoId: 'some-other-promo',
    title: 'Заголовок',
    audience: 'authenticated' as const,
    sections: ['avto'],
    categories: ['kvartiry'],
    sellerStatus: 'seller' as const,
    deviceTarget: 'both' as const,
  };

  it('inline', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'inline-x', format: 'inline',
        description: 'desc', imageUrl: 'https://cdn.example.com/x.png', textAlign: 'center',
        action: { href: '/x', label: 'Go' }, ctaColor: '#111', ctaTextColor: '#fff',
      }),
    ).not.toThrow();
  });

  it('topline', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'topline-x', format: 'topline',
        description: 'desc', backgroundColor: '#fff', textColor: '#000', action: { href: '/x' },
      }),
    ).not.toThrow();
  });

  it('popup', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'popup-x', format: 'popup',
        description: 'desc', imageUrl: 'https://cdn.example.com/x.png', dismissible: true,
        backgroundColor: '#fff', textColor: '#000', backgroundImage: 'https://cdn.example.com/bg.png',
        backgroundGradient: { from: '#fff', to: '#000', angle: 45 }, textAlign: 'left',
        action: { href: '/x', label: 'Go' }, ctaColor: '#111', ctaTextColor: '#fff',
      }),
    ).not.toThrow();
  });

  it('fullscreen', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'fullscreen-x', format: 'fullscreen',
        description: 'desc', imageUrl: 'https://cdn.example.com/x.png', dismissible: true,
        backgroundColor: '#fff', textColor: '#000', backgroundImage: 'https://cdn.example.com/bg.png',
        backgroundGradient: { from: '#fff', to: '#000', angle: 45 }, textAlign: 'right',
        action: { href: '/x', label: 'Go' }, ctaColor: '#111', ctaTextColor: '#fff',
      }),
    ).not.toThrow();
  });

  it('tooltip', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'tooltip-x', format: 'tooltip', anchor: 'home-search',
        description: 'desc', imageUrl: 'https://cdn.example.com/x.png', dismissible: true,
        backgroundColor: '#fff', textColor: '#000', textAlign: 'center',
        action: { href: '/x', label: 'Go' }, ctaColor: '#111', ctaTextColor: '#fff',
      }),
    ).not.toThrow();
  });

  it('multistep', () => {
    const parsed = promoSchema.parse({
      ...base, id: 'multistep-x', format: 'multistep',
      steps: [
        { title: 'Шаг 1', body: 'Текст шага 1', imageUrl: 'https://cdn.example.com/1.gif' },
        { title: 'Шаг 2', body: 'Текст шага 2' },
      ],
      presentation: 'fullscreen',
      backgroundColor: '#fff', textColor: '#000', backgroundImage: 'https://cdn.example.com/bg.png',
      backgroundGradient: { from: '#fff', to: '#000' },
      action: { href: '/lk/prodvizhenie/banner/new', label: 'Создать кампанию' },
      ctaColor: '#111111',
      ctaTextColor: '#ffffff',
    });
    if (parsed.format !== 'multistep') throw new Error('expected multistep promo');
    expect(parsed.action).toEqual({
      href: '/lk/prodvizhenie/banner/new',
      label: 'Создать кампанию',
    });
    expect(parsed.ctaColor).toBe('#111111');
    expect(parsed.ctaTextColor).toBe('#ffffff');
  });

  it('divkit', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'divkit-x', format: 'divkit',
        divkitUrl: 'https://cdn.example.com/layout.json',
        divkitJson: { some: 'preview-json' },
      }),
    ).not.toThrow();
  });

  it('custom', () => {
    expect(() =>
      promoSchema.parse({
        ...base, id: 'custom-x', format: 'custom',
        variant: 'reklama-onboarding', dismissible: true,
      }),
    ).not.toThrow();
  });
});

describe('CONTENT_KEYS_BY_FORMAT', () => {
  it('tooltip contains anchor', () => {
    expect(CONTENT_KEYS_BY_FORMAT.tooltip).toContain('anchor');
  });

  it('divkit does not contain description', () => {
    expect(CONTENT_KEYS_BY_FORMAT.divkit).not.toContain('description');
  });

  it('no format contains popupVariant (dead field, removed everywhere)', () => {
    for (const keys of Object.values(CONTENT_KEYS_BY_FORMAT)) {
      expect(keys).not.toContain('popupVariant');
      expect(keys).not.toContain('bullets');
    }
  });

  it('multistep contains steps, presentation and CTA, not description/imageUrl', () => {
    expect(CONTENT_KEYS_BY_FORMAT.multistep).toContain('steps');
    expect(CONTENT_KEYS_BY_FORMAT.multistep).toContain('presentation');
    expect(CONTENT_KEYS_BY_FORMAT.multistep).toContain('action');
    expect(CONTENT_KEYS_BY_FORMAT.multistep).toContain('ctaColor');
    expect(CONTENT_KEYS_BY_FORMAT.multistep).toContain('ctaTextColor');
    expect(CONTENT_KEYS_BY_FORMAT.multistep).not.toContain('description');
    expect(CONTENT_KEYS_BY_FORMAT.multistep).not.toContain('imageUrl');
  });

  it('custom contains variant, not description/imageUrl', () => {
    expect(CONTENT_KEYS_BY_FORMAT.custom).toContain('variant');
    expect(CONTENT_KEYS_BY_FORMAT.custom).not.toContain('description');
  });
});

describe('promoSchema — IP-гео таргетинг (geoSegments + geoCities, зеркало BFF)', () => {
  it('round-trips geoSegments + geoCities', () => {
    const parsed = promoSchema.parse({
      ...valid,
      targeting: { geoSegments: ['local', 'tourist'], geoCities: ['sukhum', 'sochi'] },
    });
    expect(parsed.targeting.geoSegments).toEqual(['local', 'tourist']);
    expect(parsed.targeting.geoCities).toEqual(['sukhum', 'sochi']);
  });

  it('старый JSON без гео-полей валиден, поля undefined', () => {
    const parsed = promoSchema.parse(valid);
    expect(parsed.targeting.geoSegments).toBeUndefined();
    expect(parsed.targeting.geoCities).toBeUndefined();
  });

  it('rejects unknown geo segments and bad city slugs', () => {
    expect(promoSchema.safeParse({ ...valid, targeting: { geoSegments: ['moon'] } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { geoCities: [''] } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { geoCities: ['x'.repeat(65)] } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { geoCities: ['x'.repeat(64)] } }).success).toBe(true);
  });
});

describe('promoSchema — schedule (dayparting, зеркало BFF)', () => {
  const withSchedule = (schedule: unknown) => ({ ...valid, schedule } as Promo);

  it('accepts a valid schedule block', () => {
    const parsed = promoSchema.parse(withSchedule({ daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 }));
    expect(parsed.schedule).toEqual({ daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 });
  });

  it('accepts a promo without schedule (back-compat)', () => {
    expect(promoSchema.parse(valid).schedule).toBeUndefined();
  });

  it('rejects empty daysOfWeek with «Выберите хотя бы один день»', () => {
    const res = promoSchema.safeParse(withSchedule({ daysOfWeek: [], hourStart: 0, hourEnd: 24 }));
    expect(res.success).toBe(false);
    const issue = res.success ? undefined : res.error.issues.find((i) => i.path.join('.') === 'schedule.daysOfWeek');
    expect(issue?.message).toBe('Выберите хотя бы один день');
  });

  it('rejects hourStart >= hourEnd at path schedule.hourEnd (ночные интервалы через полночь не поддерживаются)', () => {
    const res = promoSchema.safeParse(withSchedule({ daysOfWeek: [1], hourStart: 18, hourEnd: 9 }));
    expect(res.success).toBe(false);
    const issue = res.success ? undefined : res.error.issues.find((i) => i.path.join('.') === 'schedule.hourEnd');
    expect(issue?.message).toBe('Начальный час должен быть меньше конечного');
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [1], hourStart: 9, hourEnd: 9 })).success).toBe(false);
  });

  it('rejects duplicate days, the 25th hour, the 8th day and fractional hours', () => {
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [1, 1], hourStart: 9, hourEnd: 18 })).success).toBe(false);
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [1], hourStart: 9, hourEnd: 25 })).success).toBe(false);
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [8], hourStart: 9, hourEnd: 18 })).success).toBe(false);
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [0], hourStart: 9, hourEnd: 18 })).success).toBe(false);
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [1], hourStart: 9.5, hourEnd: 18 })).success).toBe(false);
  });

  it('accepts the boundary values (0..24, вс=7)', () => {
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [7], hourStart: 0, hourEnd: 24 })).success).toBe(true);
    expect(promoSchema.safeParse(withSchedule({ daysOfWeek: [1], hourStart: 23, hourEnd: 24 })).success).toBe(true);
  });

  it('is inherited by every union member (smoke: topline)', () => {
    const res = promoSchema.safeParse({
      ...valid, format: 'topline', schedule: { daysOfWeek: [], hourStart: 0, hourEnd: 24 },
    } as Promo);
    expect(res.success).toBe(false);
  });
});

describe('promoSchema — профиль визита и источник захода (зеркало BFF)', () => {
  it('accepts visitorClass with thresholds and entrySources', () => {
    const parsed = promoSchema.parse({
      ...valid,
      targeting: { visitorClass: 'newcomer', newcomerMaxAgeDays: 14 },
      entrySources: ['telegram', 'search'],
    });
    expect(parsed.targeting.visitorClass).toBe('newcomer');
    expect(parsed.targeting.newcomerMaxAgeDays).toBe(14);
    expect(parsed.entrySources).toEqual(['telegram', 'search']);
  });

  it('старый JSON без полей валиден, поля undefined', () => {
    const parsed = promoSchema.parse(valid);
    expect(parsed.targeting.visitorClass).toBeUndefined();
    expect(parsed.entrySources).toBeUndefined();
  });

  it('rejects out-of-range thresholds', () => {
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'newcomer', newcomerMaxAgeDays: 0 } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'newcomer', newcomerMaxAgeDays: 366 } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'regular', regularMinVisitDays: 0 } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'regular', regularMinVisitDays: 31 } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'regular', regularMinVisitDays: 2.5 } }).success).toBe(false);
  });

  it('accepts the boundary thresholds', () => {
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'newcomer', newcomerMaxAgeDays: 365 } }).success).toBe(true);
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'regular', regularMinVisitDays: 30 } }).success).toBe(true);
  });

  it('rejects unknown visitorClass and entry source', () => {
    expect(promoSchema.safeParse({ ...valid, targeting: { visitorClass: 'vip' } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...valid, entrySources: ['vk'] }).success).toBe(false);
  });

  it('accepts an empty entrySources array (нормализуется в undefined на persist)', () => {
    expect(promoSchema.safeParse({ ...valid, entrySources: [] }).success).toBe(true);
  });
});

describe('promoSchema — env-таргетинг (зеркало catalogue-schema BFF)', () => {
  it('round-trip трёх новых полей targeting', () => {
    const parsed = promoSchema.parse({
      ...valid,
      targeting: { os: ['ios'], environments: ['telegram', 'pwa'], deviceBrands: ['iphone', 'android-flagship'] },
    });
    expect(parsed.targeting).toEqual({
      os: ['ios'], environments: ['telegram', 'pwa'], deviceBrands: ['iphone', 'android-flagship'],
    });
  });

  it('старый JSON без полей валиден, поля undefined', () => {
    const parsed = promoSchema.parse(valid);
    expect(parsed.targeting.os).toBeUndefined();
    expect(parsed.targeting.environments).toBeUndefined();
    expect(parsed.targeting.deviceBrands).toBeUndefined();
  });

  it('значение вне enum отвергается', () => {
    expect(() => promoSchema.parse({ ...valid, targeting: { os: ['windows'] } })).toThrow();
    expect(() => promoSchema.parse({ ...valid, targeting: { environments: ['webview'] } })).toThrow();
    expect(() => promoSchema.parse({ ...valid, targeting: { deviceBrands: ['nokia'] } })).toThrow();
  });
});

describe('targeting.behavior — поведение зрителя (зеркало behaviorTargetingSchema BFF)', () => {
  const withBehavior = (behavior: unknown) =>
    promoSchema.safeParse({ ...valid, targeting: { behavior } });

  it('round-trips a full behavior block', () => {
    const behavior = {
      interest: { categories: ['shiny', 'diski'], lookbackDays: 7 },
      hotBuyer: { minPhoneViews: 2 },
      minSessionViews: 5,
    };
    const parsed = promoSchema.parse({ ...valid, targeting: { behavior } });
    expect(parsed.targeting.behavior).toEqual(behavior);
  });

  it('старый JSON без behavior валиден, поле undefined (обратная совместимость)', () => {
    expect(promoSchema.parse(valid).targeting.behavior).toBeUndefined();
  });

  it('rejects out-of-range lookbackDays (1..14 — окно RPC)', () => {
    expect(withBehavior({ interest: { categories: ['shiny'], lookbackDays: 0 } }).success).toBe(false);
    expect(withBehavior({ interest: { categories: ['shiny'], lookbackDays: 15 } }).success).toBe(false);
    expect(withBehavior({ interest: { categories: ['shiny'], lookbackDays: 7.5 } }).success).toBe(false);
    expect(withBehavior({ interest: { categories: ['shiny'], lookbackDays: 1 } }).success).toBe(true);
    expect(withBehavior({ interest: { categories: ['shiny'], lookbackDays: 14 } }).success).toBe(true);
  });

  it('rejects out-of-range minPhoneViews (1..50)', () => {
    expect(withBehavior({ hotBuyer: { minPhoneViews: 0 } }).success).toBe(false);
    expect(withBehavior({ hotBuyer: { minPhoneViews: 51 } }).success).toBe(false);
    expect(withBehavior({ hotBuyer: { minPhoneViews: 1 } }).success).toBe(true);
    expect(withBehavior({ hotBuyer: { minPhoneViews: 50 } }).success).toBe(true);
  });

  it('rejects out-of-range minSessionViews (1..100)', () => {
    expect(withBehavior({ minSessionViews: 0 }).success).toBe(false);
    expect(withBehavior({ minSessionViews: 101 }).success).toBe(false);
    expect(withBehavior({ minSessionViews: 2.5 }).success).toBe(false);
    expect(withBehavior({ minSessionViews: 1 }).success).toBe(true);
    expect(withBehavior({ minSessionViews: 100 }).success).toBe(true);
  });

  it('rejects an empty/oversized categories list and bad slugs', () => {
    expect(withBehavior({ interest: { categories: [] } }).success).toBe(false);
    expect(withBehavior({ interest: { categories: [''] } }).success).toBe(false);
    expect(withBehavior({ interest: { categories: ['x'.repeat(65)] } }).success).toBe(false);
    expect(withBehavior({ interest: { categories: ['x'.repeat(64)] } }).success).toBe(true);
    expect(withBehavior({
      interest: { categories: Array.from({ length: 21 }, (_, i) => `c${i}`) },
    }).success).toBe(false);
    expect(withBehavior({
      interest: { categories: Array.from({ length: 20 }, (_, i) => `c${i}`) },
    }).success).toBe(true);
  });

  it('trims category slugs (как в BFF: z.string().trim())', () => {
    const parsed = promoSchema.parse({
      ...valid,
      targeting: { behavior: { interest: { categories: [' shiny '] } } },
    });
    expect(parsed.targeting.behavior?.interest?.categories).toEqual(['shiny']);
  });
});

describe('lifecycle — жизненный цикл объявлений зрителя (зеркало BFF)', () => {
  const withLifecycle = (lifecycle: unknown) =>
    promoSchema.safeParse({ ...valid, lifecycle });

  it('accepts a promo with a full valid lifecycle block', () => {
    const lifecycle = {
      activeInCategories: ['avto'],
      soldWithinDays: 14,
      hasStalledActive: true,
      firstListingWithinDays: 7,
    };
    const parsed = promoSchema.parse({ ...valid, lifecycle });
    expect(parsed.lifecycle).toEqual(lifecycle);
  });

  it('accepts each condition alone and the boundary values (1, 90, 30)', () => {
    expect(withLifecycle({ soldWithinDays: 1 }).success).toBe(true);
    expect(withLifecycle({ soldWithinDays: 90 }).success).toBe(true);
    expect(withLifecycle({ firstListingWithinDays: 1 }).success).toBe(true);
    expect(withLifecycle({ firstListingWithinDays: 30 }).success).toBe(true);
    expect(withLifecycle({ hasStalledActive: true }).success).toBe(true);
    expect(withLifecycle({ activeInCategories: ['avto'] }).success).toBe(true);
  });

  it('rejects an empty lifecycle object and an all-undefined one', () => {
    expect(withLifecycle({}).success).toBe(false);
    expect(withLifecycle({ soldWithinDays: undefined }).success).toBe(false);
  });

  it('rejects out-of-range days (0, 91, 31) and fractions', () => {
    expect(withLifecycle({ soldWithinDays: 0 }).success).toBe(false);
    expect(withLifecycle({ soldWithinDays: 91 }).success).toBe(false);
    expect(withLifecycle({ soldWithinDays: 14.5 }).success).toBe(false);
    expect(withLifecycle({ firstListingWithinDays: 0 }).success).toBe(false);
    expect(withLifecycle({ firstListingWithinDays: 31 }).success).toBe(false);
  });

  it('rejects hasStalledActive: false (literal true; false не хранится) and an empty categories list', () => {
    expect(withLifecycle({ hasStalledActive: false }).success).toBe(false);
    expect(withLifecycle({ activeInCategories: [] }).success).toBe(false);
    expect(withLifecycle({ activeInCategories: [''] }).success).toBe(false);
  });

  it('старый JSON без lifecycle валиден (обратная совместимость)', () => {
    expect(promoSchema.parse(valid).lifecycle).toBeUndefined();
  });

  it('rejects audience anonymous combined with lifecycle (гейт никогда не совпадёт у гостя)', () => {
    const res = promoSchema.safeParse({ ...valid, audience: 'anonymous', lifecycle: { soldWithinDays: 14 } });
    expect(res.success).toBe(false);
    const issue = res.success ? undefined : res.error.issues.find((i) => i.path.join('.') === 'lifecycle');
    expect(issue?.message).toMatch(/гост/i);
  });

  it('accepts audience all/authenticated with lifecycle (гости просто отфильтруются)', () => {
    expect(promoSchema.safeParse({ ...valid, audience: 'all', lifecycle: { soldWithinDays: 14 } }).success).toBe(true);
    expect(promoSchema.safeParse({ ...valid, audience: 'authenticated', lifecycle: { soldWithinDays: 14 } }).success).toBe(true);
  });

  it('is inherited by every union member (smoke: topline)', () => {
    const res = promoSchema.safeParse({ ...valid, format: 'topline', lifecycle: {} } as Promo);
    expect(res.success).toBe(false);
  });
});
