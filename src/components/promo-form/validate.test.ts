import { describe, expect, it } from 'vitest';
import { getIn } from 'formik';
import type { Promo } from '@/lib/schema';
import { validatePromoForm } from './validate';

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

describe('validatePromoForm — valid values per format', () => {
  it('inline: no errors', () => {
    expect(validatePromoForm(make('inline'))).toEqual({});
  });
  it('topline: no errors', () => {
    expect(validatePromoForm(make('topline'))).toEqual({});
  });
  it('popup: no errors', () => {
    expect(validatePromoForm(make('popup'))).toEqual({});
  });
  it('fullscreen: no errors', () => {
    expect(validatePromoForm(make('fullscreen'))).toEqual({});
  });
  it('tooltip: no errors (anchor set)', () => {
    expect(validatePromoForm(make('tooltip', { anchor: 'nav-search' }))).toEqual({});
  });
  it('multistep: no errors (2 valid steps)', () => {
    expect(
      validatePromoForm(
        make('multistep', {
          steps: [
            { title: 'Шаг 1', body: 'Текст шага 1' },
            { title: 'Шаг 2', body: 'Текст шага 2' },
          ],
        }),
      ),
    ).toEqual({});
  });
  it('divkit: no errors (divkitUrl set)', () => {
    expect(validatePromoForm(make('divkit', { divkitUrl: 'https://s3.example.com/a.json' }))).toEqual({});
  });
  it('divkit: no errors (divkitJson set)', () => {
    expect(validatePromoForm(make('divkit', { divkitJson: { card: {} } }))).toEqual({});
  });
  it('custom: no errors (registered variant, empty title)', () => {
    expect(validatePromoForm(make('custom', { title: '', variant: 'reklama-onboarding' }))).toEqual({});
  });
});

describe('validatePromoForm — ZodIssue path mapping', () => {
  it('maps a nested steps.N.title issue', () => {
    const errors = validatePromoForm(
      make('multistep', {
        steps: [
          { title: '', body: 'Текст шага 1' },
          { title: 'Шаг 2', body: 'Текст шага 2' },
        ],
      }),
    );
    expect(getIn(errors, 'steps.0.title')).toBeTruthy();
  });

  it('maps a nested targeting.minAge issue', () => {
    const errors = validatePromoForm(make('inline', { targeting: { minAge: -1 } }));
    expect(getIn(errors, 'targeting.minAge')).toBeTruthy();
  });

  it('maps a nested action.href issue', () => {
    const errors = validatePromoForm(make('inline', { action: { href: '' } }));
    expect(getIn(errors, 'action.href')).toBeTruthy();
  });

  it('flags an empty id at the top level', () => {
    const errors = validatePromoForm(make('inline', { id: '' }));
    expect(errors.id).toBeTruthy();
  });
});

describe('validatePromoForm — cross-field rules', () => {
  it('flags endsAt before startsAt', () => {
    const errors = validatePromoForm(
      make('inline', { startsAt: '2024-12-31T00:00:00.000Z', endsAt: '2024-01-01T00:00:00.000Z' }),
    );
    expect(errors.endsAt).toBeTruthy();
  });

  it('flags afterPromoId referencing itself', () => {
    const errors = validatePromoForm(make('inline', { id: 'p1', afterPromoId: 'p1' }));
    expect(errors.afterPromoId).toBeTruthy();
  });

  it('allows afterPromoId referencing a different promo', () => {
    const errors = validatePromoForm(make('inline', { id: 'p1', afterPromoId: 'p2' }));
    expect(errors.afterPromoId).toBeUndefined();
  });
});

describe('validatePromoForm — divkit form-only rule', () => {
  it('requires either divkitUrl or divkitJson', () => {
    const errors = validatePromoForm(make('divkit'));
    expect(errors.divkitJson).toBeTruthy();
  });

  it('passes once divkitUrl is present', () => {
    const errors = validatePromoForm(make('divkit', { divkitUrl: 'https://s3.example.com/a.json' }));
    expect(errors.divkitJson).toBeUndefined();
  });
});

describe('validatePromoForm — tooltip anchor', () => {
  it('requires anchor', () => {
    const errors = validatePromoForm(make('tooltip'));
    expect(errors.anchor).toBeTruthy();
  });
});

describe('validatePromoForm — custom variant', () => {
  it('requires a registered variant', () => {
    const errors = validatePromoForm(make('custom', { variant: 'unknown-variant' }));
    expect(errors.variant).toBeTruthy();
  });

  it('does not require title for custom (derived at persist time)', () => {
    const errors = validatePromoForm(make('custom', { title: '', variant: 'reklama-onboarding' }));
    expect(errors.title).toBeUndefined();
  });
});

it('env-таргетинг не даёт ошибок валидации формы', () => {
  expect(validatePromoForm(make('inline', {
    targeting: { os: ['android'], environments: ['app'], deviceBrands: ['android-other'] },
  }))).toEqual({});
});

describe('validatePromoForm — schedule (dayparting)', () => {
  it('валидное расписание: без ошибок', () => {
    expect(validatePromoForm(make('inline', {
      schedule: { daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 },
    }))).toEqual({});
  });
  it('hourStart >= hourEnd → errors.schedule.hourEnd', () => {
    const errors = validatePromoForm(make('inline', {
      schedule: { daysOfWeek: [1], hourStart: 18, hourEnd: 9 },
    }));
    expect(getIn(errors, 'schedule.hourEnd')).toBe('Начальный час должен быть меньше конечного');
  });
  it('пустые дни → «Выберите хотя бы один день» (страховка + zod)', () => {
    const errors = validatePromoForm(make('inline', {
      schedule: { daysOfWeek: [], hourStart: 0, hourEnd: 24 },
    }));
    expect(getIn(errors, 'schedule.daysOfWeek')).toBe('Выберите хотя бы один день');
  });
  it('smoke на втором формате (topline наследует serving-блок)', () => {
    const errors = validatePromoForm(make('topline', {
      schedule: { daysOfWeek: [], hourStart: 0, hourEnd: 24 },
    }));
    expect(getIn(errors, 'schedule.daysOfWeek')).toBe('Выберите хотя бы один день');
  });
});

describe('validatePromoForm — гео и профиль визита', () => {
  it('валидные гео/visit-поля не дают ошибок', () => {
    expect(validatePromoForm(make('inline', {
      targeting: {
        geoSegments: ['local', 'tourist'],
        geoCities: ['sukhum', 'sochi'],
        visitorClass: 'newcomer',
        newcomerMaxAgeDays: 14,
      },
      entrySources: ['telegram'],
    }))).toEqual({});
  });
  it('порог вне диапазона → ошибка на своём пути', () => {
    const tooBig = validatePromoForm(make('inline', {
      targeting: { visitorClass: 'newcomer', newcomerMaxAgeDays: 366 },
    }));
    expect(getIn(tooBig, 'targeting.newcomerMaxAgeDays')).toBe('Не больше 365 дней');
    const tooSmall = validatePromoForm(make('inline', {
      targeting: { visitorClass: 'regular', regularMinVisitDays: 0 },
    }));
    expect(getIn(tooSmall, 'targeting.regularMinVisitDays')).toBe('Минимум 1 день');
  });
  it('пустой слаг города → ошибка', () => {
    const errors = validatePromoForm(make('inline', { targeting: { geoCities: [''] } }));
    expect(getIn(errors, 'targeting.geoCities.0')).toBe('Город не может быть пустым');
  });
});

describe('validatePromoForm — behavior (блок «Поведение»)', () => {
  it('валидный блок не даёт ошибок', () => {
    expect(validatePromoForm(make('inline', {
      targeting: {
        behavior: {
          interest: { categories: ['shiny'], lookbackDays: 7 },
          hotBuyer: { minPhoneViews: 2 },
          minSessionViews: 5,
        },
      },
    }))).toEqual({});
  });

  it('значение вне диапазона → ошибка на своём пути', () => {
    const errors = validatePromoForm(make('inline', {
      targeting: { behavior: { minSessionViews: 101 } },
    }));
    expect(getIn(errors, 'targeting.behavior.minSessionViews')).toBeTruthy();
    const errors2 = validatePromoForm(make('inline', {
      targeting: { behavior: { hotBuyer: { minPhoneViews: 0 } } },
    }));
    expect(getIn(errors2, 'targeting.behavior.hotBuyer.minPhoneViews')).toBeTruthy();
  });
});

describe('validatePromoForm — lifecycle (жизненный цикл продавца)', () => {
  it('валидный блок не даёт ошибок', () => {
    expect(validatePromoForm(make('inline', {
      lifecycle: { activeInCategories: ['avto'], soldWithinDays: 14 },
    }))).toEqual({});
  });

  it('flags lifecycle on an anonymous audience (правило superRefine продублировано формой)', () => {
    const errors = validatePromoForm(make('popup', {
      audience: 'anonymous',
      lifecycle: { soldWithinDays: 14 },
    }));
    expect(errors.lifecycle).toMatch(/гост/i);
  });

  it('does not flag a fully cleared lifecycle block (даже при anonymous)', () => {
    const errors = validatePromoForm(make('popup', {
      audience: 'anonymous',
      lifecycle: { soldWithinDays: undefined },
    }));
    expect(errors).not.toHaveProperty('lifecycle');
    expect(validatePromoForm(make('popup', { lifecycle: {} as Promo['lifecycle'] }))).toEqual({});
  });

  it('значение вне диапазона → ошибка на своём пути', () => {
    const errors = validatePromoForm(make('inline', { lifecycle: { soldWithinDays: 91 } }));
    expect(getIn(errors, 'lifecycle.soldWithinDays')).toBe('Не больше 90 дней');
  });
});
