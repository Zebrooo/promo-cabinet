import { describe, expect, it } from 'vitest';
import {
  fullCoverage, isFullCoverage, weekdays9to18, weekendsOnly, roundTheClock,
  tyreSeasonWindow, resortSeasonWindow,
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

// Границы окон: начало = 00:00:00.000 МСК (= 21:00:00.000Z накануне),
// конец = 23:59:59.000 МСК последнего дня (= 20:59:59.000Z).
describe('tyreSeasonWindow — ближайшее из двух окон (апрель / окт–ноя)', () => {
  it('15 фев → апрельское окно этого года', () => {
    expect(tyreSeasonWindow(new Date('2026-02-15T12:00:00.000Z'))).toEqual({
      startsAt: '2026-03-31T21:00:00.000Z',
      endsAt: '2026-04-30T20:59:59.000Z',
    });
  });
  it('15 мая → окт–ноя этого года', () => {
    expect(tyreSeasonWindow(new Date('2026-05-15T12:00:00.000Z'))).toEqual({
      startsAt: '2026-09-30T21:00:00.000Z',
      endsAt: '2026-11-30T20:59:59.000Z',
    });
  });
  it('10 окт → ТЕКУЩЕЕ окно окт–ноя (не перескакивает на апрель)', () => {
    expect(tyreSeasonWindow(new Date('2026-10-10T12:00:00.000Z'))).toEqual({
      startsAt: '2026-09-30T21:00:00.000Z',
      endsAt: '2026-11-30T20:59:59.000Z',
    });
  });
  it('15 дек → апрель СЛЕДУЮЩЕГО года', () => {
    expect(tyreSeasonWindow(new Date('2026-12-15T12:00:00.000Z'))).toEqual({
      startsAt: '2027-03-31T21:00:00.000Z',
      endsAt: '2027-04-30T20:59:59.000Z',
    });
  });
  it('15 апр → текущее апрельское окно', () => {
    expect(tyreSeasonWindow(new Date('2026-04-15T12:00:00.000Z'))).toEqual({
      startsAt: '2026-03-31T21:00:00.000Z',
      endsAt: '2026-04-30T20:59:59.000Z',
    });
  });
});

describe('resortSeasonWindow — 1 июня–30 сентября', () => {
  it('15 июля → текущий сезон', () => {
    expect(resortSeasonWindow(new Date('2026-07-15T12:00:00.000Z'))).toEqual({
      startsAt: '2026-05-31T21:00:00.000Z',
      endsAt: '2026-09-30T20:59:59.000Z',
    });
  });
  it('15 окт → сезон следующего года', () => {
    expect(resortSeasonWindow(new Date('2026-10-15T12:00:00.000Z'))).toEqual({
      startsAt: '2027-05-31T21:00:00.000Z',
      endsAt: '2027-09-30T20:59:59.000Z',
    });
  });
  it('15 фев → сезон этого года (ещё впереди)', () => {
    expect(resortSeasonWindow(new Date('2026-02-15T12:00:00.000Z'))).toEqual({
      startsAt: '2026-05-31T21:00:00.000Z',
      endsAt: '2026-09-30T20:59:59.000Z',
    });
  });
});
