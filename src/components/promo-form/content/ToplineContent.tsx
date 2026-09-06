'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { ColorField, TextareaField } from '../fields';
import { ColorsRow, CtaFields } from './shared';

/** topline: description, surface/title/description colors, action{href,label},
 *  ctaColor and ctaTextColor. */
export function ToplineContent() {
  const { values } = useFormikContext<Promo>();
  return (
    <>
      <TextareaField name="description" label="ОПИСАНИЕ" placeholder="Дополнительный текст под заголовком" />
      <ColorsRow
        withDescription
        backgroundFallback="#2563EB"
        textFallback="#ffffff"
        descriptionFallback="#ffffff"
      />
      <CtaFields withLabel />
      {values.action && (
        <div className="ef-row">
          <ColorField name="ctaColor" label="Цвет кнопки" fallback="#E11D2A" />
          <ColorField name="ctaTextColor" label="Цвет текста на кнопке" fallback="#ffffff" />
        </div>
      )}
    </>
  );
}
