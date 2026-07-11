'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { TextareaField, ColorField } from '../fields';
import { PromoImageUpload } from '@/components/PromoImageUpload';
import { CtaFields, TextAlignField } from './shared';

/** inline: description, imageUrl, textAlign, action{href,label}, ctaColor, ctaTextColor. */
export function InlineContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <TextareaField name="description" label="ОПИСАНИЕ" placeholder="Дополнительный текст под заголовком" />
      <section className="ef-block">
        <div className="ef-label">ИЗОБРАЖЕНИЕ</div>
        <PromoImageUpload
          value={values.imageUrl ?? ''}
          onChange={(url) => setFieldValue('imageUrl', url || undefined)}
          label="Картинка карточки"
          recommend="600×400"
          format={values.format}
        />
      </section>
      <CtaFields withLabel />
      <TextAlignField />
      {values.action && (
        <div className="ef-row">
          <ColorField name="ctaColor" label="Цвет кнопки" fallback="#E11D2A" />
          <ColorField name="ctaTextColor" label="Цвет текста на кнопке" fallback="#ffffff" />
        </div>
      )}
    </>
  );
}
