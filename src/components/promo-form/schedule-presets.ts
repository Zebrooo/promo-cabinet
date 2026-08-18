// Чистые функции пресетов расписания (спека targeting-schedule §2.2).
// Никакого DOM — тестируются на vitest как логика. Сезонные пресеты дат
// («сезон шин», «курортный сезон») убраны по фидбеку владельца.
import type { PromoSchedule } from '@/lib/schema';

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
