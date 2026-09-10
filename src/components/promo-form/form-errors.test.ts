import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { flattenFormErrors, labelForPath, summarizeFormErrors, zodIssuesToFormErrors } from './form-errors';

describe('flattenFormErrors', () => {
  it('разворачивает дерево в список путей с сообщениями, пропуская пустые ветки', () => {
    expect(flattenFormErrors({
      title: 'Укажите заголовок',
      action: { href: 'Укажите ссылку' },
      steps: [undefined, { title: 'Пусто' }],
      targeting: { minAge: 'Возраст не может быть отрицательным', maxAge: undefined },
      description: '',
    })).toEqual([
      { path: 'title', message: 'Укажите заголовок' },
      { path: 'action.href', message: 'Укажите ссылку' },
      { path: 'steps.1.title', message: 'Пусто' },
      { path: 'targeting.minAge', message: 'Возраст не может быть отрицательным' },
    ]);
    expect(flattenFormErrors({})).toEqual([]);
    expect(flattenFormErrors(undefined)).toEqual([]);
  });
});

describe('labelForPath', () => {
  it('знает основные поля, шаги визарда и карточки таргетинга', () => {
    expect(labelForPath('action.href')).toBe('Ссылка кнопки (CTA)');
    expect(labelForPath('steps.1.title')).toBe('Шаг 2 — заголовок');
    expect(labelForPath('steps.0.imageUrl')).toBe('Шаг 1 — картинка');
    expect(labelForPath('steps')).toBe('Шаги визарда');
    expect(labelForPath('targeting.minAge')).toBe('Возраст — minAge');
    expect(labelForPath('targeting.advertiser.launchedWithinDays')).toBe('Рекламные кампании — launchedWithinDays');
    expect(labelForPath('targeting.advertiser')).toBe('Рекламные кампании');
    expect(labelForPath('lifecycle')).toBe('Жизненный цикл продавца');
    expect(labelForPath('something.unknown')).toBe('something.unknown');
  });
});

describe('summarizeFormErrors / zodIssuesToFormErrors', () => {
  it('собирает сводку с подписями', () => {
    expect(summarizeFormErrors({ action: { href: 'Укажите ссылку' } })).toEqual([
      { path: 'action.href', label: 'Ссылка кнопки (CTA)', message: 'Укажите ссылку' },
    ]);
  });

  it('превращает zod-issues в дерево FormikErrors по путям', () => {
    const err = new ZodError([
      { code: 'custom', path: ['endsAt'], message: 'Дата начала должна быть раньше даты окончания' },
      { code: 'custom', path: ['steps', 0, 'title'], message: 'Пусто' },
    ]);
    expect(zodIssuesToFormErrors(err.issues)).toEqual({
      endsAt: 'Дата начала должна быть раньше даты окончания',
      steps: [{ title: 'Пусто' }],
    });
  });
});
