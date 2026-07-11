'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { KNOWN_CUSTOM_VARIANTS } from '@/lib/custom-variants';
import { CheckboxField, FieldError } from '../fields';

/** custom: variant (обязателен, из KNOWN_CUSTOM_VARIANTS), dismissible —
 *  ничего больше. Визуал целиком у хоста (customFormats на <PromoProvider>). */
export function CustomContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <section className="ef-block">
        <div className="ef-label">ВАРИАНТ</div>
        <select
          className="ef-input"
          value={values.variant ?? ''}
          onChange={(e) => setFieldValue('variant', e.target.value || undefined)}
        >
          <option value="">Выберите вариант…</option>
          {KNOWN_CUSTOM_VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <FieldError name="variant" />
        {values.variant ? (
          <div className="hint">
            {KNOWN_CUSTOM_VARIANTS.find((v) => v.id === values.variant)?.description}
          </div>
        ) : (
          <div className="hint hint-warn">Выберите вариант host-компонента.</div>
        )}
      </section>
      <CheckboxField name="dismissible" label='Можно закрыть кнопкой «×»' />
    </>
  );
}
