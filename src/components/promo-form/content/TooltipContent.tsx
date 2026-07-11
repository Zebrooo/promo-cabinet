'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { TextareaField, CheckboxField, FieldError } from '../fields';
import { PromoImageUpload } from '@/components/PromoImageUpload';
import { CANONICAL_ANCHORS } from '@/lib/catalogue';
import { CtaFields, TextAlignField, ColorsRow } from './shared';

/** tooltip: anchor (обязателен), description, imageUrl, dismissible,
 *  backgroundColor, textColor, textAlign, action{href,label}, ctaColor,
 *  ctaTextColor. */
export function TooltipContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <>
      <section className="ef-block">
        <div className="ef-label">ЯКОРЬ</div>
        <select
          className="ef-input"
          value={values.anchor ?? ''}
          onChange={(e) => setFieldValue('anchor', e.target.value || undefined)}
        >
          <option value="">Выберите якорь…</option>
          {CANONICAL_ANCHORS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        <FieldError name="anchor" />
        {!values.anchor && (
          <div className="hint hint-warn">Выберите элемент, у которого появится тултип.</div>
        )}
      </section>
      <TextareaField name="description" label="ОПИСАНИЕ" placeholder="Дополнительный текст под заголовком" />
      <section className="ef-block">
        <div className="ef-label">ИЗОБРАЖЕНИЕ</div>
        <PromoImageUpload
          value={values.imageUrl ?? ''}
          onChange={(url) => setFieldValue('imageUrl', url || undefined)}
          label="Картинка карточки"
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
      <TextAlignField />
      <CheckboxField name="dismissible" label='Можно закрыть кнопкой «×»' />
    </>
  );
}
