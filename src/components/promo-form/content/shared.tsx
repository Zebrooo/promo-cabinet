'use client';
// Shared content-section building blocks reused by 2+ formats — CTA row and
// text-alignment segment control. Kept out of fields.tsx because they compose
// multiple primitives + read values (not pure useField wrappers).
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { HintIcon } from '../HintIcon';

/** CTA href (+ optional label) row. `withLabel=false` mirrors topline's
 *  action shape (href only — the renderer never shows a topline CTA label). */
export function CtaFields({ withLabel }: { withLabel: boolean }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const href = values.action?.href ?? '';
  const label = values.action?.label ?? '';
  // Лид-режим: кнопка отправляет рекламодателю телефон пользователя и никуда
  // не ведёт, поэтому поле ссылки прячем — сохраняется заглушка '#'
  // (to-persisted). Подпись остаётся: ею объясняем человеку, что произойдёт.
  const lead = values.leadCapture === true;
  return (
    <section className="ef-block">
      <div className="ef-label">CTA</div>
      <label className="ef-checkbox">
        <input
          type="checkbox"
          checked={lead}
          onChange={(e) => {
            const on = e.target.checked;
            setFieldValue('leadCapture', on || undefined);
            setFieldValue(
              'action',
              on
                ? { href: '#', label: label || 'Связаться' }
                : href && href !== '#'
                  ? { href, label: label || undefined }
                  : undefined,
            );
          }}
        />
        Собирать лиды: кнопка отправляет телефон рекламодателю
        <HintIcon
          label="Сбор лидов"
          text="Кнопка не ведёт по ссылке: залогиненный пользователь по нажатию отправляет рекламодателю свой номер из профиля. Анониму сайт предложит войти. Отправившему заявку это промо больше не показывается. Лиды и выгрузка Excel — в разделе «Лиды»."
        />
      </label>
      <div className="ef-cta-row">
        {withLabel && (
          <input
            className="ef-input"
            value={label}
            disabled={!lead && !href}
            onChange={(e) =>
              setFieldValue(
                'action',
                lead
                  ? { href: '#', label: e.target.value || 'Связаться' }
                  : href
                    ? { href, label: e.target.value || undefined }
                    : undefined,
              )
            }
            placeholder="Подробнее"
          />
        )}
        {!lead && (
          <input
            className="ef-input mono"
            value={href}
            onChange={(e) =>
              setFieldValue(
                'action',
                e.target.value
                  ? { href: e.target.value, label: withLabel ? label || undefined : undefined }
                  : undefined,
              )
            }
            placeholder="https://abkhaz-auto.ru/…"
          />
        )}
      </div>
    </section>
  );
}

export function TextAlignField() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const active = values.textAlign ?? 'left';
  return (
    <div className="ef-field">
      <label>Выравнивание текста</label>
      <div className="ef-segment">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button
            type="button"
            key={a}
            className={`ef-segment-btn${active === a ? ' is-active' : ''}`}
            onClick={() => setFieldValue('textAlign', a)}
            style={{ flex: 1 }}
          >
            <span className="ef-segment-name">{a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}</span>
            <span className="ef-segment-sub">{a === 'left' ? 'Слева' : a === 'center' ? 'По центру' : 'Справа'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Background color + text color pair — popup/fullscreen/tooltip/topline/multistep. */
export function ColorsRow() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <div className="ef-row">
      <div className="ef-field">
        <label>Цвет фона</label>
        <input
          type="color"
          className="ef-input ef-color"
          value={values.backgroundColor ?? '#E11D2A'}
          onChange={(e) => setFieldValue('backgroundColor', e.target.value)}
        />
      </div>
      <div className="ef-field">
        <label>Цвет текста</label>
        <input
          type="color"
          className="ef-input ef-color"
          value={values.textColor ?? '#ffffff'}
          onChange={(e) => setFieldValue('textColor', e.target.value)}
        />
      </div>
    </div>
  );
}

/** Background gradient picker — from/to/angle. Available on every overlay-ish
 *  format that carries backgroundGradient in its member schema. */
export function GradientField() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const g = values.backgroundGradient;
  return (
    <div className="ef-field" style={{ gridColumn: '1 / -1' }}>
      <label>Градиент фона <HintIcon label="Градиент фона" text="Перекрывает «цвет фона», если задан." /></label>
      <div className="ef-gradient-row">
        <input
          type="color"
          className="ef-input ef-color"
          value={g?.from ?? '#E11D2A'}
          onChange={(e) => setFieldValue('backgroundGradient', { ...(g ?? {}), from: e.target.value })}
          title="Начало градиента"
        />
        <input
          type="color"
          className="ef-input ef-color"
          value={g?.to ?? '#9B1B1B'}
          onChange={(e) => setFieldValue('backgroundGradient', { ...(g ?? { from: '#E11D2A' }), to: e.target.value })}
          title="Конец градиента"
        />
        <input
          type="number"
          className="ef-input"
          min={0} max={360} step={5}
          placeholder="135°"
          value={g?.angle ?? ''}
          onChange={(e) => {
            const angle = e.target.value === '' ? undefined : Number(e.target.value);
            setFieldValue('backgroundGradient', { ...(g ?? { from: '#E11D2A' }), angle });
          }}
          style={{ maxWidth: 100 }}
        />
        <button
          type="button"
          className="ef-link-btn"
          onClick={() => setFieldValue('backgroundGradient', undefined)}
        >Убрать градиент</button>
      </div>
    </div>
  );
}
