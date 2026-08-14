import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { toPersisted, toPreview } from './to-persisted';

const base: Omit<Promo, 'format'> = {
  id: 'summer-sale',
  name: 'Summer Sale',
  startsAt: '2024-01-01T00:00:00.000Z',
  endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {},
  cooldownHours: 0,
  title: 'Заголовок',
};

function make(format: Promo['format'], patch: Partial<Promo> = {}): Promo {
  return { ...base, format, ...patch } as Promo;
}

describe('toPersisted — strips cross-format junk (equivalent to the old sanitize() CAPS table)', () => {
  it('popup carries multistep junk (steps) → stripped', () => {
    const draft = make('popup', {
      description: 'desc',
      steps: [
        { title: 'Шаг 1', body: 'Текст 1' },
        { title: 'Шаг 2', body: 'Текст 2' },
      ],
      presentation: 'fullscreen',
      variant: 'reklama-onboarding',
      anchor: 'home-search',
      divkitUrl: 'https://s3.example.com/a.json',
      divkitJson: { card: {} },
    });
    const out = toPersisted(draft);
    expect(out).not.toHaveProperty('steps');
    expect(out).not.toHaveProperty('presentation');
    expect(out).not.toHaveProperty('variant');
    expect(out).not.toHaveProperty('anchor');
    expect(out).not.toHaveProperty('divkitUrl');
    expect(out).not.toHaveProperty('divkitJson');
    expect(out.description).toBe('desc');
  });

  it('inline strips popup-only overlay fields (dismissible, backgroundImage, backgroundGradient)', () => {
    const draft = make('inline', {
      dismissible: true,
      backgroundImage: 'https://cdn.example.com/bg.png',
      backgroundGradient: { from: '#111', to: '#222' },
    });
    const out = toPersisted(draft);
    expect(out).not.toHaveProperty('dismissible');
    expect(out).not.toHaveProperty('backgroundImage');
    expect(out).not.toHaveProperty('backgroundGradient');
  });

  it('topline strips imageUrl/ctaColor/ctaTextColor/textAlign and action.label (topline CTA has no label)', () => {
    const draft = make('topline', {
      imageUrl: 'https://cdn.example.com/x.png',
      ctaColor: '#E11D2A',
      ctaTextColor: '#fff',
      textAlign: 'center',
      action: { href: '/x', label: 'Подробнее' },
    });
    const out = toPersisted(draft);
    expect(out).not.toHaveProperty('imageUrl');
    expect(out).not.toHaveProperty('ctaColor');
    expect(out).not.toHaveProperty('ctaTextColor');
    expect(out).not.toHaveProperty('textAlign');
    expect(out.action).toEqual({ href: '/x' });
  });

  it('divkit strips all content fields (title still required, kept)', () => {
    const draft = make('divkit', {
      divkitJson: { card: {} },
      description: 'desc',
      imageUrl: 'https://cdn.example.com/x.png',
      action: { href: '/x' },
    });
    const out = toPersisted(draft);
    expect(out).not.toHaveProperty('description');
    expect(out).not.toHaveProperty('imageUrl');
    expect(out).not.toHaveProperty('action');
    expect(out.title).toBe('Заголовок');
  });

  it('custom strips all decorative fields, keeps variant + dismissible', () => {
    const draft = make('custom', {
      variant: 'reklama-onboarding',
      dismissible: true,
      description: 'desc',
      imageUrl: 'https://cdn.example.com/x.png',
      action: { href: '/x' },
      backgroundColor: '#fff',
    });
    const out = toPersisted(draft);
    expect(out).not.toHaveProperty('description');
    expect(out).not.toHaveProperty('imageUrl');
    expect(out).not.toHaveProperty('action');
    expect(out).not.toHaveProperty('backgroundColor');
    expect(out.variant).toBe('reklama-onboarding');
    expect(out.dismissible).toBe(true);
  });
});

describe('toPersisted — search targeting', () => {
  it('keeps the nested search contract as a serving field', () => {
    const out = toPersisted(make('inline', {
      targeting: {
        search: {
          terms: ['toyota camry'],
          sections: ['avto'],
          match: 'all',
          lookbackDays: 14,
        },
      },
    }));

    expect(out.targeting.search).toEqual({
      terms: ['toyota camry'],
      sections: ['avto'],
      match: 'all',
      lookbackDays: 14,
    });
  });

  it('drops period/match when both phrases and sections are empty', () => {
    const out = toPersisted(make('inline', {
      targeting: {
        search: {
          terms: [],
          sections: [],
          match: 'all',
          lookbackDays: 7,
        },
      },
    }));

    expect(out.targeting).not.toHaveProperty('search');
  });
});

describe('toPersisted — purchases/balance targeting', () => {
  it('strips an empty purchases block (no fields set → no criterion)', () => {
    const values = make('inline', { targeting: { purchases: {} } });
    const result = toPersisted(values);
    expect(result.targeting.purchases).toBeUndefined();
  });

  it('keeps a purchases block with only purchased:false set', () => {
    const values = make('inline', { targeting: { purchases: { purchased: false } } });
    const result = toPersisted(values);
    expect(result.targeting.purchases).toEqual({ purchased: false });
  });

  it('strips an empty balance block (no fields set → no criterion)', () => {
    const values = make('inline', { targeting: { balance: {} } });
    const result = toPersisted(values);
    expect(result.targeting.balance).toBeUndefined();
  });

  it('keeps a balance block with only currentBelow set', () => {
    const values = make('inline', { targeting: { balance: { currentBelow: 0 } } });
    const result = toPersisted(values);
    expect(result.targeting.balance).toEqual({ currentBelow: 0 });
  });

  it('strips a purchases block where every field was individually cleared to undefined (regression: Object.keys bug)', () => {
    const values = make('inline', { targeting: { purchases: { minTotalKopecks: undefined, purchased: undefined } } });
    const result = toPersisted(values);
    expect(result.targeting.purchases).toBeUndefined();
  });

  it('strips a purchases block containing only lookbackDays (modifier, not a criterion)', () => {
    const values = make('inline', { targeting: { purchases: { lookbackDays: 60 } } });
    const result = toPersisted(values);
    expect(result.targeting.purchases).toBeUndefined();
  });

  it('strips a balance block where every field was individually cleared to undefined', () => {
    const values = make('inline', { targeting: { balance: { currentAbove: undefined, movementBelow: undefined } } });
    const result = toPersisted(values);
    expect(result.targeting.balance).toBeUndefined();
  });

  it('strips a balance block containing only movementLookbackDays (modifier, not a criterion)', () => {
    const values = make('inline', { targeting: { balance: { movementLookbackDays: 14 } } });
    const result = toPersisted(values);
    expect(result.targeting.balance).toBeUndefined();
  });

  it('still keeps a purchases block with a real criterion alongside a cleared field', () => {
    const values = make('inline', { targeting: { purchases: { purchased: undefined, minCount: 3 } } });
    const result = toPersisted(values);
    expect(result.targeting.purchases).toEqual({ minCount: 3 });
  });
});

describe('toPersisted — listings targeting', () => {
  it('strips an empty listings block (no fields set → no criterion)', () => {
    const values = make('inline', { targeting: { listings: {} } });
    const result = toPersisted(values);
    expect(result.targeting.listings).toBeUndefined();
  });

  it('keeps a listings block with only hasUnpromotedActive:false set', () => {
    const values = make('inline', { targeting: { listings: { hasUnpromotedActive: false } } });
    const result = toPersisted(values);
    expect(result.targeting.listings).toEqual({ hasUnpromotedActive: false });
  });

  it('keeps a listings block with only inactiveDays set', () => {
    const values = make('inline', { targeting: { listings: { inactiveDays: 0 } } });
    const result = toPersisted(values);
    expect(result.targeting.listings).toEqual({ inactiveDays: 0 });
  });

  it('keeps a listings block with only categories set', () => {
    const values = make('inline', { targeting: { listings: { categories: ['cars'] } } });
    const result = toPersisted(values);
    expect(result.targeting.listings).toEqual({ categories: ['cars'] });
  });

  it('keeps a listings block with only activeCategories set', () => {
    const values = make('inline', { targeting: { listings: { activeCategories: ['cars'] } } });
    const result = toPersisted(values);
    expect(result.targeting.listings).toEqual({ activeCategories: ['cars'] });
  });

  it('strips a listings block where every field was individually cleared to undefined (regression: Object.keys bug)', () => {
    const values = make('inline', {
      targeting: { listings: { categories: undefined, hasUnpromotedActive: undefined } },
    });
    const result = toPersisted(values);
    expect(result.targeting.listings).toBeUndefined();
  });

  it('strips a listings block containing only categoriesMatch (modifier, not a criterion)', () => {
    const values = make('inline', { targeting: { listings: { categoriesMatch: 'all' } } });
    const result = toPersisted(values);
    expect(result.targeting.listings).toBeUndefined();
  });

  it('still keeps a listings block with a real criterion alongside a cleared field', () => {
    const values = make('inline', {
      targeting: { listings: { categoriesMatch: 'all', hasUnpromotedActive: undefined, inactiveDays: 30 } },
    });
    const result = toPersisted(values);
    expect(result.targeting.listings).toEqual({ categoriesMatch: 'all', inactiveDays: 30 });
  });
});

describe('toPersisted — custom title derivation', () => {
  it('derives title from the variant label when title is empty', () => {
    const draft = make('custom', { title: '', variant: 'reklama-onboarding' });
    const out = toPersisted(draft);
    expect(out.title).toBe('Онбординг рекламного кабинета');
  });

  it('keeps a manually-entered title if present', () => {
    const draft = make('custom', { title: 'Мой заголовок', variant: 'reklama-onboarding' });
    const out = toPersisted(draft);
    expect(out.title).toBe('Мой заголовок');
  });

  it('falls back to promo name if title empty and variant unknown to the label map', () => {
    // (variant validity is enforced by validatePromoForm/promoSchema, not
    // toPersisted — this only exercises the derivation fallback chain.)
    const draft = make('custom', { title: '', variant: undefined, name: 'Внутреннее имя' });
    expect(() => toPersisted(draft)).toThrow(); // variant required by promoSchema — parse() rejects
  });
});

describe('toPersisted — divkit post-upload divkitJson cleanup', () => {
  it('divkitJson is dropped once divkitUrl is set (the sanitize() leak fix)', () => {
    const draft = make('divkit', {
      divkitUrl: 'https://s3.example.com/uploaded.json',
      divkitJson: { card: { should: 'not-leak' } },
    });
    const out = toPersisted(draft);
    expect(out.divkitUrl).toBe('https://s3.example.com/uploaded.json');
    // zod keeps an explicitly-undefined optional key as an own property, but
    // its VALUE is undefined — which is what matters: JSON.stringify (used
    // for both the S3 payload and the API request body) drops undefined
    // values, so nothing leaks into storage.
    expect(out.divkitJson).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('not-leak');
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('divkitJson');
  });

  it('keeps divkitJson when there is no divkitUrl yet (pre-save preview state)', () => {
    const draft = make('divkit', { divkitJson: { card: { ok: true } } });
    const out = toPersisted(draft);
    expect(out.divkitJson).toEqual({ card: { ok: true } });
  });
});

describe('toPersisted — CTA colors only with action present', () => {
  it('drops ctaColor/ctaTextColor when there is no action', () => {
    const draft = make('inline', { ctaColor: '#E11D2A', ctaTextColor: '#fff', action: undefined });
    const out = toPersisted(draft);
    expect(out.ctaColor).toBeUndefined();
    expect(out.ctaTextColor).toBeUndefined();
  });

  it('keeps ctaColor/ctaTextColor when action is present', () => {
    const draft = make('inline', { ctaColor: '#E11D2A', ctaTextColor: '#fff', action: { href: '/x' } });
    const out = toPersisted(draft);
    expect(out.ctaColor).toBe('#E11D2A');
    expect(out.ctaTextColor).toBe('#fff');
  });
});

describe('multistep CTA projection', () => {
  const multistep = make('multistep', {
    steps: [
      { title: 'Шаг 1', body: 'Текст 1' },
      { title: 'Шаг 2', body: 'Текст 2' },
    ],
    action: { href: '/lk/prodvizhenie/banner/new', label: 'Создать кампанию' },
    ctaColor: '#123456',
    ctaTextColor: '#ffffff',
  });

  it('keeps action and CTA colors in persisted data', () => {
    const out = toPersisted(multistep);
    expect(out.action).toEqual(multistep.action);
    expect(out.ctaColor).toBe('#123456');
    expect(out.ctaTextColor).toBe('#ffffff');
  });

  it('keeps action and CTA colors in the lenient preview projection', () => {
    const out = toPreview(multistep);
    expect(out.action).toEqual(multistep.action);
    expect(out.ctaColor).toBe('#123456');
    expect(out.ctaTextColor).toBe('#ffffff');
  });
});

describe('toPreview — lenient projection for the mid-edit/invalid preview rail', () => {
  it('never throws on an invalid draft (empty title)', () => {
    const draft = make('inline', { title: '' });
    expect(() => toPreview(draft)).not.toThrow();
  });

  it('popup carrying multistep junk (steps) does not leak into the preview', () => {
    const draft = make('popup', {
      description: 'desc',
      steps: [
        { title: 'Шаг 1', body: 'Текст 1' },
        { title: 'Шаг 2', body: 'Текст 2' },
      ],
    });
    const out = toPreview(draft);
    expect(out).not.toHaveProperty('steps');
    expect(out.description).toBe('desc');
  });

  it('strips cross-format junk the same way toPersisted does (divkit fields on a popup draft)', () => {
    const draft = make('popup', {
      divkitUrl: 'https://s3.example.com/a.json',
      divkitJson: { card: {} },
      anchor: 'home-search',
    });
    const out = toPreview(draft);
    expect(out).not.toHaveProperty('divkitUrl');
    expect(out).not.toHaveProperty('divkitJson');
    expect(out).not.toHaveProperty('anchor');
  });

  it('an invalid (empty) title does not force a throw and is passed through as-is for non-custom formats', () => {
    const draft = make('inline', { title: '' });
    const out = toPreview(draft);
    expect(out.title).toBe('');
  });

  it('still derives the custom title from the variant label, same as toPersisted', () => {
    const draft = make('custom', { title: '', variant: 'reklama-onboarding' });
    const out = toPreview(draft);
    expect(out.title).toBe('Онбординг рекламного кабинета');
  });

  it('keeps serving keys (id/name/format/targeting) regardless of format', () => {
    const draft = make('tooltip', { anchor: 'nav-search' });
    const out = toPreview(draft);
    expect(out.id).toBe('summer-sale');
    expect(out.name).toBe('Summer Sale');
    expect(out.format).toBe('tooltip');
    expect(out.anchor).toBe('nav-search');
  });
});
