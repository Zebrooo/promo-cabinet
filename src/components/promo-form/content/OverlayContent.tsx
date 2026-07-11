'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { TextareaField, CheckboxField } from '../fields';
import { PromoImageUpload } from '@/components/PromoImageUpload';
import { CtaFields, TextAlignField, ColorsRow, GradientField } from './shared';

/** popup & fullscreen (identical content shape): description, imageUrl,
 *  dismissible, backgroundColor, textColor, backgroundImage,
 *  backgroundGradient, textAlign, action{href,label}, ctaColor, ctaTextColor.
 *  popupVariant/bullets are dead fields — removed from this UI entirely. */
export function OverlayContent() {
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
          recommend={values.format === 'fullscreen' ? '1200×1600' : '600×400'}
          format={values.format}
        />
      </section>
      <CtaFields withLabel />
      {values.action && (
        <div className="ef-row">
          <div className="ef-field">
            <label>Цвет кнопки</label>
            <input
              type="color"
              className="ef-input ef-color"
              value={values.ctaColor ?? '#E11D2A'}
              onChange={(e) => setFieldValue('ctaColor', e.target.value)}
            />
          </div>
          <div className="ef-field">
            <label>Цвет текста на кнопке</label>
            <input
              type="color"
              className="ef-input ef-color"
              value={values.ctaTextColor ?? '#ffffff'}
              onChange={(e) => setFieldValue('ctaTextColor', e.target.value)}
            />
          </div>
        </div>
      )}
      <ColorsRow />
      <GradientField />
      <section className="ef-block">
        <div className="ef-label">ФОН-КАРТИНКА</div>
        <PromoImageUpload
          value={values.backgroundImage ?? ''}
          onChange={(url) => setFieldValue('backgroundImage', url || undefined)}
          label="Фон промо"
          recommend="1200×1600"
          format={values.format}
        />
      </section>
      <TextAlignField />
      <CheckboxField name="dismissible" label='Можно закрыть кнопкой «×»' />
    </>
  );
}
