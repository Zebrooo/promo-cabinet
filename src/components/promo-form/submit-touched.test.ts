// Locks the contract behind the PromoForm.tsx submit-time touched fix:
// nested FormikErrors paths (targeting.minAge, action.href, steps.0.title)
// must come back touched=true through getIn(), not just their top-level key.
// A flat `Object.fromEntries(Object.keys(errors).map(k => [k, true]))` only
// sets the top-level key and leaves nested paths undefined — that was the
// bug (FieldError never rendered for nested fields on submit).
import { describe, expect, it } from 'vitest';
import { getIn, setNestedObjectValues } from 'formik';
import type { FormikErrors } from 'formik';
import type { Promo } from '@/lib/schema';

describe('setNestedObjectValues — submit-time touched contract', () => {
  it('touches a nested targeting.minAge error path', () => {
    const errors: FormikErrors<Promo> = { targeting: { minAge: 'Возраст не может быть отрицательным' } };
    const touched = setNestedObjectValues<Record<string, unknown>>(errors, true);
    expect(getIn(touched, 'targeting.minAge')).toBe(true);
  });

  it('touches a nested action.href error path', () => {
    // `action`/`steps` are optional-object Promo fields, so FormikErrors'
    // conditional type (Values[K] extends object ? ... : string) resolves
    // to `string` once undefined is unioned in — TS can't see that setIn()
    // actually nests an object here at runtime. Cast via unknown, same as
    // the shape zod's issue.path mapping produces (which is what we're
    // testing).
    const errors = { action: { href: 'Укажите ссылку' } } as unknown as FormikErrors<Promo>;
    const touched = setNestedObjectValues<Record<string, unknown>>(errors, true);
    expect(getIn(touched, 'action.href')).toBe(true);
  });

  it('touches a nested steps.0.title error path', () => {
    const errors = { steps: [{ title: 'Укажите заголовок шага' }] } as unknown as FormikErrors<Promo>;
    const touched = setNestedObjectValues<Record<string, unknown>>(errors, true);
    expect(getIn(touched, 'steps.0.title')).toBe(true);
  });

  it('a flat Object.keys map (the pre-fix bug) leaves nested paths undefined — regression guard', () => {
    const errors: FormikErrors<Promo> = { targeting: { minAge: 'bad' } };
    const flatTouched = Object.fromEntries(Object.keys(errors).map((k) => [k, true]));
    expect(getIn(flatTouched, 'targeting.minAge')).toBeUndefined();
  });
});
