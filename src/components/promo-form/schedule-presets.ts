// Чистые функции пресетов расписания и сезонных окон дат (спека
// targeting-schedule §2.2). Никакого DOM — тестируются на vitest как логика.
import type { PromoSchedule } from '@/lib/schema';

/** Москва живёт на постоянном UTC+3 (без переходов с 2014); Сухум — на
 *  московском времени. */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
export const ALL_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/** Состояние «без ограничений» для UI: то, что форма показывает, когда поля
 *  в промо нет. В S3 НЕ пишется (нормализация в to-persisted.ts). */
export function fullCoverage(): PromoSchedule {
  return { daysOfWeek: [...ALL_DAYS], hourStart: 0, hourEnd: 24 };
}

/** true, если расписание эквивалентно «24/7» (или отсутствует). Порядок дней
 *  не важен. Используется нормализацией to-persisted.ts. */
export function isFullCoverage(s: PromoSchedule | undefined): boolean {
  if (!s) return true;
  return s.hourStart === 0 && s.hourEnd === 24 && ALL_DAYS.every((d) => s.daysOfWeek.includes(d));
}

/** Пресеты расписания (кнопки над чипами; трогают только дни/часы). */
export function weekdays9to18(): PromoSchedule {
  return { daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 };
}
export function weekendsOnly(): PromoSchedule {
  return { daysOfWeek: [6, 7], hourStart: 0, hourEnd: 24 };
}
export function roundTheClock(): PromoSchedule {
  return fullCoverage();
}

/** Окно дат сезонного пресета (трогает startsAt/endsAt, расписание — нет). */
export interface SeasonWindow { startsAt: string; endsAt: string }

/** Начало суток по МСК → ISO(UTC): 00:00 МСК = 21:00Z накануне. */
function mskDayStartIso(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day) - MSK_OFFSET_MS).toISOString();
}
/** Конец суток по МСК (23:59:59.000): Date.UTC сам нормализует day+1
 *  через границу месяца (например «31 апреля» → 1 мая). */
function mskDayEndIso(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day + 1) - MSK_OFFSET_MS - 1000).toISOString();
}
function mskYear(today: Date): number {
  return new Date(today.getTime() + MSK_OFFSET_MS).getUTCFullYear();
}
/** Первое окно, чей конец ещё не прошёл (текущее или наступающее). Список
 *  кандидатов хронологический и всегда содержит окно следующего года,
 *  поэтому find всегда находит. */
function pickCurrentOrNext(candidates: SeasonWindow[], today: Date): SeasonWindow {
  const t = today.getTime();
  return candidates.find((w) => new Date(w.endsAt).getTime() >= t) ?? candidates[candidates.length - 1];
}

/** «Сезон шин»: ближайшее (текущее или наступающее) из окон
 *  1–30 апреля / 1 октября – 30 ноября относительно `today` по МСК.
 *  Сезон календарно двугорбый, а startsAt/endsAt — одно сплошное окно,
 *  поэтому кнопка подставляет актуальную фазу (спека §2.2). */
export function tyreSeasonWindow(today: Date): SeasonWindow {
  const y = mskYear(today);
  return pickCurrentOrNext([
    { startsAt: mskDayStartIso(y, 3, 1), endsAt: mskDayEndIso(y, 3, 30) },         // 1–30 апреля y
    { startsAt: mskDayStartIso(y, 9, 1), endsAt: mskDayEndIso(y, 10, 30) },        // 1 окт – 30 ноя y
    { startsAt: mskDayStartIso(y + 1, 3, 1), endsAt: mskDayEndIso(y + 1, 3, 30) }, // апрель y+1
  ], today);
}

/** «Курортный сезон»: 1 июня – 30 сентября, текущий или следующий. */
export function resortSeasonWindow(today: Date): SeasonWindow {
  const y = mskYear(today);
  return pickCurrentOrNext([
    { startsAt: mskDayStartIso(y, 5, 1), endsAt: mskDayEndIso(y, 8, 30) },         // 1 июня – 30 сент y
    { startsAt: mskDayStartIso(y + 1, 5, 1), endsAt: mskDayEndIso(y + 1, 8, 30) }, // y+1
  ], today);
}
