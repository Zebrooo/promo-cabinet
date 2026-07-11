'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { TextareaField } from '../fields';
import { ColorsRow } from './shared';

/** topline: description, backgroundColor, textColor, action{href — БЕЗ label}. */
export function ToplineContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <TextareaField name="description" label="ОПИСАНИЕ" placeholder="Дополнительный текст под заголовком" />
      <ColorsRow />
      <section className="ef-block">
        <div className="ef-label">CTA</div>
        <div className="ef-cta-row">
          <input
            className="ef-input mono"
            value={values.action?.href ?? ''}
            onChange={(e) => setFieldValue('action', e.target.value ? { href: e.target.value } : undefined)}
            placeholder="https://abkhaz-auto.ru/…"
          />
        </div>
      </section>
    </>
  );
}
