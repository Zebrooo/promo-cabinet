import { describe, expect, it } from 'vitest';
import type { Promo } from '@/lib/schema';
import { promoFormats } from '@/lib/schema';
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

describe('toPersisted — env-таргетинг переживает стрип каждого формата', () => {
  const FORMAT_PATCH: Record<Promo['format'], Partial<Promo>> = {
    inline: {}, topline: {}, popup: {}, fullscreen: {},
    tooltip: { anchor: 'home-search' },
    multistep: { steps: [{ title: 'Шаг 1', body: 'Т1' }, { title: 'Шаг 2', body: 'Т2' }] },
    divkit: { divkitUrl: 'https://s3.example.com/a.json' },
    custom: { variant: 'reklama-onboarding' },
  };
  const envTargeting = { os: ['ios' as const], environments: ['telegram' as const, 'pwa' as const], deviceBrands: ['iphone' as const] };

  for (const format of promoFormats) {
    it(`${format}: targeting.os/environments/deviceBrands сохраняются`, () => {
      const draft = make(format, { ...FORMAT_PATCH[format], targeting: envTargeting });
      const out = toPersisted(draft);
      expect(out.targeting).toEqual(envTargeting);
    });
  }
});

describe('toPersisted — таргетинг волны A переживает стрип каждого формата (geo + schedule + visit)', () => {
  const FORMAT_PATCH: Record<Promo['format'], Partial<Promo>> = {
    inline: {}, topline: {}, popup: {}, fullscreen: {},
    tooltip: { anchor: 'home-search' },
    multistep: { steps: [{ title: 'Шаг 1', body: 'Т1' }, { title: 'Шаг 2', body: 'Т2' }] },
    divkit: { divkitUrl: 'https://s3.example.com/a.json' },
    custom: { variant: 'reklama-onboarding' },
  };
  const waveTargeting = {
    geoSegments: ['tourist' as const],
    geoCities: ['sochi', 'moskva'],
    visitorClass: 'regular' as const,
    regularMinVisitDays: 7,
  };
  const schedule = { daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 };

  for (const format of promoFormats) {
    it(`${format}: geoSegments/geoCities/visitorClass/schedule/entrySources сохраняются`, () => {
      const draft = make(format, {
        ...FORMAT_PATCH[format],
        targeting: waveTargeting,
        schedule,
        entrySources: ['telegram', 'search'],
      });
      const out = toPersisted(draft);
      expect(out.targeting).toEqual(waveTargeting);
      expect(out.schedule).toEqual(schedule);
      expect(out.entrySources).toEqual(['telegram', 'search']);
    });
  }
});

describe('toPersisted — schedule normalization (полное покрытие → поле не пишется)', () => {
  it('7 дней (в любом порядке) + 0–24 → schedule undefined и не попадает в JSON', () => {
    const out = toPersisted(make('inline', {
      schedule: { daysOfWeek: [7, 6, 5, 4, 3, 2, 1], hourStart: 0, hourEnd: 24 },
    }));
    expect(out.schedule).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('schedule');
  });
  it('частичное покрытие сохраняется как есть', () => {
    const schedule = { daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 };
    expect(toPersisted(make('inline', { schedule })).schedule).toEqual(schedule);
  });
  it('все дни, но усечённые часы — сохраняется', () => {
    const schedule = { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], hourStart: 9, hourEnd: 18 };
    expect(toPersisted(make('popup', { schedule })).schedule).toEqual(schedule);
  });
  it('черновик без schedule проходит без изменений (back-compat)', () => {
    const out = toPersisted(make('inline'));
    expect(out.schedule).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('schedule');
  });
  it('toPreview нормализует так же (общий normalize)', () => {
    const out = toPreview(make('inline', {
      schedule: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], hourStart: 0, hourEnd: 24 },
    }));
    expect(out.schedule).toBeUndefined();
  });
});

describe('toPersisted — visit-profile normalization', () => {
  it('порог чужого класса вычищается', () => {
    const out = toPersisted(make('inline', {
      targeting: { visitorClass: 'newcomer', newcomerMaxAgeDays: 14, regularMinVisitDays: 10 },
    }));
    expect(out.targeting.visitorClass).toBe('newcomer');
    expect(out.targeting.newcomerMaxAgeDays).toBe(14);
    expect(out.targeting.regularMinVisitDays).toBeUndefined();
  });
  it('порог совсем без класса вычищается', () => {
    const out = toPersisted(make('inline', { targeting: { newcomerMaxAgeDays: 14 } }));
    expect(out.targeting.visitorClass).toBeUndefined();
    expect(out.targeting.newcomerMaxAgeDays).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out.targeting))).not.toHaveProperty('newcomerMaxAgeDays');
  });
  it('entrySources: [] → undefined (пусто = любой источник)', () => {
    const out = toPersisted(make('inline', { entrySources: [] }));
    expect(out.entrySources).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('entrySources');
  });
  it('round-trip промо со всеми новыми полями', () => {
    const out = toPersisted(make('popup', {
      targeting: { visitorClass: 'regular', regularMinVisitDays: 7 },
      entrySources: ['telegram', 'search'],
    }));
    expect(out.targeting).toEqual({ visitorClass: 'regular', regularMinVisitDays: 7 });
    expect(out.entrySources).toEqual(['telegram', 'search']);
  });
});

describe('toPersisted — behavior targeting (блок «Поведение»)', () => {
  it('keeps a full behavior block as a serving field', () => {
    const behavior = {
      interest: { categories: ['shiny', 'diski'], lookbackDays: 7 },
      hotBuyer: { minPhoneViews: 2 },
      minSessionViews: 5,
    };
    const out = toPersisted(make('inline', { targeting: { behavior } }));
    expect(out.targeting.behavior).toEqual(behavior);
  });

  it('strips an empty behavior block (no criteria → no key in JSON)', () => {
    const out = toPersisted(make('inline', { targeting: { behavior: {} } }));
    expect(out.targeting.behavior).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out.targeting))).not.toHaveProperty('behavior');
  });

  it('strips a behavior block where every field was individually cleared to undefined', () => {
    const out = toPersisted(make('inline', {
      targeting: { behavior: { interest: undefined, hotBuyer: undefined, minSessionViews: undefined } },
    }));
    expect(out.targeting.behavior).toBeUndefined();
  });

  it('drops an interest sub-block containing only lookbackDays (modifier, not a criterion)', () => {
    const out = toPersisted(make('inline', {
      targeting: { behavior: { interest: { lookbackDays: 7 }, minSessionViews: 3 } },
    }));
    expect(out.targeting.behavior).toEqual({ minSessionViews: 3 });
  });

  it('drops an interest sub-block whose categories were cleared to undefined', () => {
    const out = toPersisted(make('inline', {
      targeting: { behavior: { interest: { categories: undefined, lookbackDays: 14 } } },
    }));
    expect(out.targeting.behavior).toBeUndefined();
  });

  it('keeps a hotBuyer block without minPhoneViews (дефолт BFF = 2)', () => {
    const out = toPersisted(make('inline', { targeting: { behavior: { hotBuyer: {} } } }));
    expect(out.targeting.behavior).toEqual({ hotBuyer: {} });
  });

  it('keeps minSessionViews alone', () => {
    const out = toPersisted(make('inline', { targeting: { behavior: { minSessionViews: 5 } } }));
    expect(out.targeting.behavior).toEqual({ minSessionViews: 5 });
  });

  it('toPreview normalizes the same way (общий normalize)', () => {
    const out = toPreview(make('popup', { targeting: { behavior: { interest: { lookbackDays: 7 } } } }));
    expect(out.targeting.behavior).toBeUndefined();
  });
});

describe('toPersisted — lifecycle is a serving field', () => {
  const REQUIRED_BY_FORMAT: Partial<Record<Promo['format'], Partial<Promo>>> = {
    tooltip: { anchor: 'home-search' },
    multistep: { steps: [{ title: 'Шаг 1', body: 'Т1' }, { title: 'Шаг 2', body: 'Т2' }] },
    custom: { variant: 'reklama-onboarding' },
    divkit: { divkitUrl: 'https://s3.example.com/a.json' },
  };

  it('lifecycle survives toPersisted for every format', () => {
    const lifecycle = { activeInCategories: ['avto'], soldWithinDays: 14 };
    for (const format of promoFormats) {
      const out = toPersisted(make(format, { ...REQUIRED_BY_FORMAT[format], lifecycle }));
      expect(out.lifecycle, format).toEqual(lifecycle);
    }
  });

  it('cleared controls (all-undefined lifecycle) → the key is absent from the persisted JSON', () => {
    const out = toPersisted(make('popup', { lifecycle: { soldWithinDays: undefined } }));
    expect(out.lifecycle).toBeUndefined();
    expect(JSON.parse(JSON.stringify(out))).not.toHaveProperty('lifecycle');
  });

  it('an empty lifecycle object {} is dropped, not persisted', () => {
    const out = toPersisted(make('popup', { lifecycle: {} as Promo['lifecycle'] }));
    expect(out.lifecycle).toBeUndefined();
  });

  it('toPreview carries lifecycle like any serving key', () => {
    const out = toPreview(make('popup', { lifecycle: { hasStalledActive: true } }));
    expect(out.lifecycle).toEqual({ hasStalledActive: true });
  });
});
