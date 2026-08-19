import { describe, expect, it } from 'vitest';
import {
  escapeForSpreadsheet,
  formatWhen,
  moscowDayRange,
  queuesByPromo,
  reportFileName,
  toRows,
  toSheetMatrix,
} from './leads-report';
import type { Lead } from './bff-client';

const lead: Lead = {
  createdAt: '2026-08-19T07:30:00.000Z',
  promoId: 'divany',
  promoTitle: 'Диваны от 20 000 ₽',
  page: '/mebel',
  name: 'Пётр',
  phone: '+79781234567',
};

describe('formatWhen', () => {
  it('переводит время в московское — рекламодатель звонит по своим часам', () => {
    // 07:30 UTC = 10:30 MSK
    expect(formatWhen(lead.createdAt)).toContain('10:30');
    expect(formatWhen(lead.createdAt)).toContain('19.08.2026');
  });

  it('нечитаемую дату отдаёт как есть, а не «Invalid Date»', () => {
    expect(formatWhen('вчера')).toBe('вчера');
  });
});

describe('queuesByPromo', () => {
  it('собирает все очереди, в которых лежит промо', () => {
    const map = queuesByPromo({
      main: { persist: false, ids: ['divany', 'other'] },
      mebel: { persist: true, ids: ['divany'] },
    });
    expect(map.get('divany')).toEqual(['main', 'mebel']);
    expect(map.get('other')).toEqual(['main']);
    expect(map.get('нет-такого')).toBeUndefined();
  });
});

describe('toRows', () => {
  it('склеивает заявку с очередями промо', () => {
    const rows = toRows([lead], new Map([['divany', ['main', 'mebel']]]));
    expect(rows[0]).toMatchObject({
      name: 'Пётр',
      phone: '+79781234567',
      promoId: 'divany',
      promoTitle: 'Диваны от 20 000 ₽',
      queues: 'main, mebel',
      page: '/mebel',
    });
  });

  it('промо вне очередей даёт пустую колонку, а не падение', () => {
    expect(toRows([lead], new Map())[0].queues).toBe('');
  });
});

describe('escapeForSpreadsheet', () => {
  it('обезвреживает формулу Excel в тексте, пришедшем с клиента', () => {
    expect(escapeForSpreadsheet('=1+1')).toBe("'=1+1");
    expect(escapeForSpreadsheet('+7 978')).toBe("'+7 978");
    expect(escapeForSpreadsheet('-скидка')).toBe("'-скидка");
    expect(escapeForSpreadsheet('@всем')).toBe("'@всем");
  });

  it('обычный текст не трогает', () => {
    expect(escapeForSpreadsheet('Диваны от 20 000 ₽')).toBe('Диваны от 20 000 ₽');
  });
});

describe('toSheetMatrix', () => {
  it('первая строка — шапка, дальше данные в том же порядке колонок', () => {
    const matrix = toSheetMatrix(toRows([lead], new Map([['divany', ['main']]])));
    expect(matrix[0]).toEqual(['Когда', 'Имя', 'Телефон', 'Промо (id)', 'Промо', 'Очередь', 'Страница']);
    expect(matrix[1]).toHaveLength(matrix[0].length);
    // телефон начинается с «+» — в Excel это формула, поэтому апостроф
    expect(matrix[1][2]).toBe("'+79781234567");
  });
});

describe('reportFileName', () => {
  it('без фильтра — общий файл, с фильтром — с id промо', () => {
    expect(reportFileName()).toBe('leads.xlsx');
    expect(reportFileName('divany')).toBe('leads-divany.xlsx');
  });

  it('чистит небезопасные символы id из имени файла', () => {
    expect(reportFileName('../../etc/passwd')).toBe('leads-______etc_passwd.xlsx');
  });
});

describe('moscowDayRange', () => {
  it('день считается по Москве, как и время в таблице', () => {
    // 20.08 00:00 МСК = 19.08 21:00 UTC. По UTC-границе заявка, поданная
    // в 01:00 МСК 20-го, выпала бы из фильтра «с 20-го».
    expect(moscowDayRange('2026-08-20').from).toBe('2026-08-19T21:00:00.000Z');
  });

  it('верхняя граница включает весь выбранный день', () => {
    expect(moscowDayRange(undefined, '2026-08-20').to).toBe('2026-08-20T21:00:00.000Z');
  });

  it('пустые и кривые значения дают отсутствие границы, а не Invalid Date', () => {
    expect(moscowDayRange()).toEqual({ from: undefined, to: undefined });
    expect(moscowDayRange('вчера', 'завтра')).toEqual({ from: undefined, to: undefined });
  });
});
