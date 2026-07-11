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
