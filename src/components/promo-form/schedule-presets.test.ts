import { describe, expect, it } from 'vitest';
import {
  fullCoverage, isFullCoverage, weekdays9to18, weekendsOnly, roundTheClock,
} from './schedule-presets';

describe('расписания-пресеты', () => {
  it('weekdays9to18 возвращает ровно Пн–Пт 9→18', () => {
    expect(weekdays9to18()).toEqual({ daysOfWeek: [1, 2, 3, 4, 5], hourStart: 9, hourEnd: 18 });
  });
  it('weekendsOnly возвращает ровно Сб–Вс 0→24', () => {
    expect(weekendsOnly()).toEqual({ daysOfWeek: [6, 7], hourStart: 0, hourEnd: 24 });
  });
  it('roundTheClock = полное покрытие', () => {
    expect(roundTheClock()).toEqual({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], hourStart: 0, hourEnd: 24 });
    expect(isFullCoverage(roundTheClock())).toBe(true);
  });
});

describe('isFullCoverage', () => {
  it('undefined и 7 дней + 0–24 (в любом порядке) — полное покрытие', () => {
    expect(isFullCoverage(undefined)).toBe(true);
    expect(isFullCoverage({ daysOfWeek: [7, 6, 5, 4, 3, 2, 1], hourStart: 0, hourEnd: 24 })).toBe(true);
  });
  it('усечённые дни или часы — не полное', () => {
    expect(isFullCoverage(weekdays9to18())).toBe(false);
    expect(isFullCoverage({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], hourStart: 0, hourEnd: 23 })).toBe(false);
    expect(isFullCoverage({ daysOfWeek: [1, 2, 3, 4, 5, 6, 7], hourStart: 1, hourEnd: 24 })).toBe(false);
    expect(isFullCoverage(weekendsOnly())).toBe(false);
  });
  it('fullCoverage() каждый раз новый объект (нельзя мутировать общий)', () => {
    expect(fullCoverage()).not.toBe(fullCoverage());
    const a = fullCoverage();
    const b = fullCoverage();
    expect(a.daysOfWeek).not.toBe(b.daysOfWeek);
  });
});
