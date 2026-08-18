'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FieldError } from '../fields';

function isoToLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string {
  if (!local) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** id, name, startsAt/endsAt — isoToLocalInput-конвертация на границе
 *  инпута, как в монолите. Базовые поля промо: видимая секция сразу под
 *  «где показывать», а не в свёрнутых расширенных настройках. */
export function BasicsSection({ mode }: { mode: 'create' | 'edit' }) {
  const { values, setFieldValue, handleChange, handleBlur } = useFormikContext<Promo>();
  return (
    <section className="ef-block">
      <div className="ef-label">ОСНОВНОЕ</div>

      <div className="ef-row">
        <div className="ef-field">
          <label>ID (slug)</label>
          <input
            className="ef-input mono"
            name="id"
            value={values.id}
            disabled={mode === 'edit'}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="summer-sale"
          />
          <FieldError name="id" />
        </div>
        <div className="ef-field">
          <label>Внутреннее название</label>
          <input
            className="ef-input"
            name="name"
            value={values.name}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Летняя акция 2025"
          />
          <FieldError name="name" />
        </div>
      </div>

      <div className="ef-row">
        <div className="ef-field">
          <label>Начало показа</label>
          <input
            type="datetime-local"
            className="ef-input"
            value={isoToLocalInput(values.startsAt)}
            onChange={(e) => setFieldValue('startsAt', localInputToIso(e.target.value))}
          />
          <FieldError name="startsAt" />
        </div>
        <div className="ef-field">
          <label>Окончание показа</label>
          <input
            type="datetime-local"
            className="ef-input"
            value={isoToLocalInput(values.endsAt)}
            onChange={(e) => setFieldValue('endsAt', localInputToIso(e.target.value))}
          />
          <FieldError name="endsAt" />
        </div>
      </div>
    </section>
  );
}
