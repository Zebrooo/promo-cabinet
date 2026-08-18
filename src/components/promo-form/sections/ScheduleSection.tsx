'use client';
import { useFormikContext } from 'formik';
import type { Promo, PromoSchedule } from '@/lib/schema';
import { FieldError } from '../fields';
import {
  fullCoverage, weekdays9to18, weekendsOnly, roundTheClock,
  tyreSeasonWindow, resortSeasonWindow,
} from '../schedule-presets';

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; // индекс i → ISO-день i+1
const HOURS_FROM = Array.from({ length: 24 }, (_, h) => h);     // 0..23
const HOURS_TO = Array.from({ length: 24 }, (_, h) => h + 1);   // 1..24
const fmtHour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

/** Диапазон дат в МСК для подписи под сезонными пресетами. Display-only. */
function mskRange(startsAt: string, endsAt: string): string | null {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const fmt = (d: Date) =>
    d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });
  return `${fmt(start)} — ${fmt(end)} (МСК)`;
}

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
 *  инпута, как в монолите. Lives inside the "Расширенные настройки"
 *  disclosure, mirroring the pre-refactor layout. */
export function ScheduleSection({ mode }: { mode: 'create' | 'edit' }) {
  const { values, setFieldValue, handleChange, handleBlur } = useFormikContext<Promo>();
  return (
    <>
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

      {/* Сезонные пресеты дат: трогают ТОЛЬКО startsAt/endsAt, расписание не
          трогают. «Сезон шин» календарно двугорбый (апрель / окт–ноя) — кнопка
          подставляет ближайшую фазу, фактический диапазон виден в подписи. */}
      <div className="ef-field">
        <label>Сезонные пресеты дат</label>
        <div className="ef-queues">
          <button
            type="button"
            className="qchip"
            onClick={() => {
              const w = tyreSeasonWindow(new Date());
              setFieldValue('startsAt', w.startsAt);
              setFieldValue('endsAt', w.endsAt);
            }}
          >
            Сезон шин
          </button>
          <button
            type="button"
            className="qchip"
            onClick={() => {
              const w = resortSeasonWindow(new Date());
              setFieldValue('startsAt', w.startsAt);
              setFieldValue('endsAt', w.endsAt);
            }}
          >
            Курортный сезон
          </button>
        </div>
        {values.startsAt && values.endsAt && mskRange(values.startsAt, values.endsAt) && (
          <span className="ef-hint">Окно показа: {mskRange(values.startsAt, values.endsAt)}</span>
        )}
        <span className="ef-hint">
          Кнопка заполняет ближайшее (текущее или наступающее) окно сезона; «Сезон шин» —
          одну из двух фаз (1–30 апреля либо 1 октября – 30 ноября). Даты можно поправить руками.
        </span>
      </div>

      <div className="ef-divider" />
      <div className="ef-label">Расписание показов (МСК)</div>
      {(() => {
        // Источник истины один — Formik: отсутствие поля рисуем как полное
        // покрытие (все дни, 0–24); любое взаимодействие пишет цельный объект.
        // «Круглосуточно» при сохранении нормализуется в отсутствие поля
        // (to-persisted.ts).
        const schedule: PromoSchedule = values.schedule ?? fullCoverage();
        const set = (next: PromoSchedule) => setFieldValue('schedule', next);
        return (
          <>
            <div className="ef-field">
              <div className="ef-queues">
                <button type="button" className="qchip" onClick={() => set(weekdays9to18())}>
                  Будни 9–18
                </button>
                <button type="button" className="qchip" onClick={() => set(weekendsOnly())}>
                  Только выходные
                </button>
                <button type="button" className="qchip" onClick={() => set(roundTheClock())}>
                  Круглосуточно
                </button>
              </div>
            </div>
            <div className="ef-field">
              <label>Дни недели</label>
              <div className="ef-queues">
                {DAY_LABELS.map((label, i) => {
                  const day = i + 1;
                  const on = schedule.daysOfWeek.includes(day);
                  const last = on && schedule.daysOfWeek.length === 1; // снять последний день нельзя
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`qchip${on ? ' on' : ''}`}
                      disabled={last}
                      title={last ? 'Нужен хотя бы один день показа' : undefined}
                      onClick={() => set({
                        ...schedule,
                        daysOfWeek: on
                          ? schedule.daysOfWeek.filter((d) => d !== day)
                          : [...schedule.daysOfWeek, day].sort((a, b) => a - b),
                      })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <FieldError name="schedule.daysOfWeek" />
            </div>
            <div className="ef-row">
              <div className="ef-field">
                <label>Показывать с</label>
                <select
                  className="ef-input"
                  value={schedule.hourStart}
                  onChange={(e) => set({ ...schedule, hourStart: Number(e.target.value) })}
                >
                  {HOURS_FROM.map((h) => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
                <FieldError name="schedule.hourStart" />
              </div>
              <div className="ef-field">
                <label>Показывать до</label>
                <select
                  className="ef-input"
                  value={schedule.hourEnd}
                  onChange={(e) => set({ ...schedule, hourEnd: Number(e.target.value) })}
                >
                  {HOURS_TO.map((h) => (
                    <option key={h} value={h}>{h === 24 ? '24:00 (до полуночи)' : fmtHour(h)}</option>
                  ))}
                </select>
                <FieldError name="schedule.hourEnd" />
              </div>
            </div>
            <span className="ef-hint">
              Время московское (МСК, UTC+3). «До» — исключающая граница: с 9 до 18 = показы
              в 9:00–17:59. Интервалы через полночь не поддерживаются — делайте два промо.
              Все дни и 0–24 = без ограничений (поле не сохраняется).
            </span>
          </>
        );
      })()}
    </>
  );
}
