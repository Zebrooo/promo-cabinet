'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { TextareaField, ColorField, FieldError } from '../fields';
import { PromoImageUpload } from '@/components/PromoImageUpload';
import { ColorsRow, CtaFields, TextAlignField } from './shared';

/** inline: description, surface/title/description colors, imageUrl, textAlign,
 *  action{href,label}, ctaColor, ctaTextColor.
 *  promoline — тот же контент плюс позиция в ленте (afterListings). */
export function InlineContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <TextareaField name="description" label="ОПИСАНИЕ" placeholder="Дополнительный текст под заголовком" />
      <ColorsRow
        withDescription
        backgroundFallback="#ffffff"
        textFallback="#16181D"
        descriptionFallback="#555555"
      />
      <section className="ef-block">
        <div className="ef-label">ИЗОБРАЖЕНИЕ</div>
        <PromoImageUpload
          value={values.imageUrl ?? ''}
          onChange={(url) => setFieldValue('imageUrl', url || undefined)}
          label="Картинка карточки"
          recommend="600×400"
          format={values.format}
        />
        <FieldError name="imageUrl" />
      </section>
      <CtaFields withLabel />
      <TextAlignField />
      {values.action && (
        <div className="ef-row">
          <ColorField name="ctaColor" label="Цвет кнопки" fallback="#E11D2A" />
          <ColorField name="ctaTextColor" label="Цвет текста на кнопке" fallback="#ffffff" />
        </div>
      )}
      {values.format === 'promoline' && (
        <section className="ef-block">
          <div className="ef-label">ПОЗИЦИЯ В ЛЕНТЕ</div>
          <div className="ef-field">
            <label>Через сколько объявлений вставлять строку</label>
            <input
              type="number"
              className="ef-input mono"
              min={4}
              max={50}
              step={1}
              value={values.afterListings ?? ''}
              onChange={(e) =>
                setFieldValue('afterListings', e.target.value === '' ? undefined : Number(e.target.value))
              }
              placeholder="4"
            />
            <FieldError name="afterListings" />
            <div className="hint">
              Считаются только органические карточки (VIP и баннеры не в счёт). Пусто — после
              четвёртой. Меньше 4 нельзя: строка вставляется только ниже первого экрана. Если
              карточек в ленте меньше, чем задано, строка встанет после последней.
            </div>
          </div>
        </section>
      )}
    </>
  );
}
