'use client';
import { FieldArray, useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { PromoImageUpload } from '@/components/PromoImageUpload';
import { ColorField } from '../fields';
import { ColorsRow, CtaFields, GradientField } from './shared';

const STEP_TITLE_MAX = 80;
const STEP_BODY_MAX  = 240;
const STEPS_MIN = 2;
const STEPS_MAX = 6;

type Step = { title: string; body: string; imageUrl?: string };

/** multistep: steps[2..6]{title≤80, body≤240, imageUrl?} (обязательны),
 *  presentation, backgroundColor, textColor, backgroundImage,
 *  backgroundGradient, action{href,label}, ctaColor, ctaTextColor. */
export function MultistepContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const steps: Step[] = values.steps ?? [];

  return (
    <>
      <FieldArray name="steps">
        {({ push, remove, move }) => (
          <section className="ef-block">
            <div className="ef-label-row">
              <div className="ef-label">ШАГИ ВИЗАРДА</div>
              <div className={`ef-counter mono${steps.length < STEPS_MIN || steps.length > STEPS_MAX ? ' over' : ''}`}>
                {steps.length} / {STEPS_MIN}–{STEPS_MAX}
              </div>
            </div>
            <div className="ef-steps">
              {steps.map((st, i) => (
                <div key={i} className="ef-step">
                  <div className="ef-step-head">
                    <span className="ef-step-num mono">Шаг {i + 1}</span>
                    <div className="ef-step-tools">
                      <button
                        type="button" className="ef-step-btn"
                        onClick={() => move(i, i - 1)} disabled={i === 0}
                        aria-label={`Переместить шаг ${i + 1} вверх`}
                      >↑</button>
                      <button
                        type="button" className="ef-step-btn"
                        onClick={() => move(i, i + 1)} disabled={i === steps.length - 1}
                        aria-label={`Переместить шаг ${i + 1} вниз`}
                      >↓</button>
                      <button
                        type="button" className="ef-step-btn danger"
                        onClick={() => remove(i)}
                        aria-label={`Удалить шаг ${i + 1}`}
                      >✕</button>
                    </div>
                  </div>
                  <div className="ef-label-row">
                    <span className="ef-sublabel">Заголовок</span>
                    <span className={`ef-counter mono${st.title.length > STEP_TITLE_MAX ? ' over' : ''}`}>
                      {st.title.length} / {STEP_TITLE_MAX}
                    </span>
                  </div>
                  <input
                    className="ef-input"
                    value={st.title}
                    onChange={(e) => setFieldValue(`steps.${i}.title`, e.target.value)}
                    placeholder="Что происходит на шаге"
                    maxLength={STEP_TITLE_MAX + 20}
                  />
                  <div className="ef-label-row">
                    <span className="ef-sublabel">Текст</span>
                    <span className={`ef-counter mono${st.body.length > STEP_BODY_MAX ? ' over' : ''}`}>
                      {st.body.length} / {STEP_BODY_MAX}
                    </span>
                  </div>
                  <textarea
                    className="ef-input ef-textarea"
                    rows={2}
                    value={st.body}
                    onChange={(e) => setFieldValue(`steps.${i}.body`, e.target.value)}
                    placeholder="Короткое пояснение под заголовком шага"
                    maxLength={STEP_BODY_MAX + 40}
                  />
                  <div className="ef-label-row">
                    <span className="ef-sublabel">Картинка/гифка (необязательно)</span>
                  </div>
                  <PromoImageUpload
                    value={st.imageUrl ?? ''}
                    onChange={(url) => setFieldValue(`steps.${i}.imageUrl`, url || undefined)}
                    label={`Картинка шага ${i + 1}`}
                  />
                  <div className="hint">Если пусто — на сайте показывается анимированная сцена.</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="ef-step-add"
              onClick={() => push({ title: '', body: '' })}
              disabled={steps.length >= STEPS_MAX}
            >
              + Добавить шаг
            </button>
            {steps.length < STEPS_MIN && (
              <div className="hint hint-warn">Нужно минимум {STEPS_MIN} шага — без них визард не сохранится.</div>
            )}
            {steps.some((s) => !s.title.trim() || !s.body.trim()) && (
              <div className="hint hint-warn">Заполните заголовок и текст у каждого шага.</div>
            )}
          </section>
        )}
      </FieldArray>

      <section className="ef-block">
        <div className="ef-label">ОТОБРАЖЕНИЕ</div>
        <div className="ef-segment">
          {([
            { v: 'modal',      name: 'Модалка',       sub: 'центрированный диалог' },
            { v: 'fullscreen', name: 'Во весь экран', sub: 'визард на весь вьюпорт' },
          ] as const).map(({ v, name, sub }) => {
            const active = (values.presentation ?? 'modal') === v;
            return (
              <button
                type="button"
                key={v}
                className={`ef-segment-btn${active ? ' is-active' : ''}`}
                onClick={() => setFieldValue('presentation', v)}
                aria-pressed={active}
              >
                <span className="ef-segment-name">{name}</span>
                <span className="ef-segment-sub">{sub}</span>
              </button>
            );
          })}
        </div>
      </section>

      <CtaFields withLabel />
      {values.action && (
        <div className="ef-row">
          <ColorField name="ctaColor" label="Цвет кнопки" fallback="#E11D2A" />
          <ColorField name="ctaTextColor" label="Цвет текста на кнопке" fallback="#ffffff" />
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
    </>
  );
}
