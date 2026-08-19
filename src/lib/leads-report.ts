/**
 * Сборка отчёта по лидам: строки для таблицы кабинета и для выгрузки Excel —
 * одни и те же (спека 2026-08-19-promo-hot-lead-design §6). Модуль чистый:
 * ни S3, ни сети, ни Excel-библиотеки — поэтому покрыт юнит-тестами целиком.
 */
import type { Lead } from '@/lib/bff-client';
import type { QueueObject } from '@/lib/schema';

export interface LeadRow {
  /** Дата и время заявки в Europe/Moscow — рекламодателю нужен звонок «по часам». */
  when: string;
  name: string;
  phone: string;
  promoId: string;
  promoTitle: string;
  /** Очереди, в которых лежит промо; вычисляет кабинет — сайт очередь не знает. */
  queues: string;
  page: string;
}

export const LEAD_COLUMNS = [
  { key: 'when', header: 'Когда', width: 20 },
  { key: 'name', header: 'Имя', width: 20 },
  { key: 'phone', header: 'Телефон', width: 18 },
  { key: 'promoId', header: 'Промо (id)', width: 22 },
  { key: 'promoTitle', header: 'Промо', width: 32 },
  { key: 'queues', header: 'Очередь', width: 18 },
  { key: 'page', header: 'Страница', width: 24 },
] as const;

const MOSCOW_FORMAT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : MOSCOW_FORMAT.format(date);
}

/** promoId → очереди, где он лежит. Промо может быть сразу в нескольких. */
export function queuesByPromo(queues: Record<string, QueueObject>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [name, queue] of Object.entries(queues)) {
    for (const id of queue.ids) {
      const list = map.get(id);
      if (list) list.push(name);
      else map.set(id, [name]);
    }
  }
  return map;
}

export function toRows(leads: Lead[], queues: Map<string, string[]>): LeadRow[] {
  return leads.map((lead) => ({
    when: formatWhen(lead.createdAt),
    name: lead.name,
    phone: lead.phone,
    promoId: lead.promoId,
    promoTitle: lead.promoTitle,
    queues: (queues.get(lead.promoId) ?? []).join(', '),
    page: lead.page,
  }));
}

/**
 * Excel исполняет ячейку, начинающуюся с `=`, `+`, `-` или `@`, как формулу —
 * а название промо приходит снимком с клиента. Обезвреживаем апострофом
 * (Excel показывает текст как есть, но формулой его не считает).
 */
export function escapeForSpreadsheet(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** Матрица «шапка + строки» для писателя xlsx: колонки в порядке LEAD_COLUMNS. */
export function toSheetMatrix(rows: LeadRow[]): string[][] {
  return [
    LEAD_COLUMNS.map((c) => c.header),
    ...rows.map((row) => LEAD_COLUMNS.map((c) => escapeForSpreadsheet(row[c.key]))),
  ];
}

/** Границы периода для запроса в bff.
 *
 * Форма даёт дни (`YYYY-MM-DD`), а таблица и отчёт показывают МОСКОВСКОЕ время.
 * Поэтому и границы московские: без явного `+03:00` день считался бы по UTC, и
 * заявка, поданная в 01:00 МСК, попадала бы в предыдущий день — в отчёте она
 * стоит 20-м числом, а в фильтре «с 20-го» её бы не было.
 * `to` в форме включительный, в запрос уходит начало следующего дня.
 */
export function moscowDayRange(from?: string, to?: string): { from?: string; to?: string } {
  return { from: startOfMoscowDay(from), to: startOfMoscowDay(to, 1) };
}

function startOfMoscowDay(day: string | undefined, plusDays = 0): string | undefined {
  if (!day) return undefined;
  const date = new Date(`${day}T00:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + plusDays);
  return date.toISOString();
}

/** Потолок выдачи bff. Столько строк максимум увидит и таблица, и выгрузка;
 *  если пришло ровно столько — данные могли обрезаться, и об этом надо сказать
 *  вслух, а не отдать рекламодателю молча урезанный отчёт. */
export const LEADS_LIMIT = 5000;

/** Имя файла выгрузки: с фильтром по промо — с его id, иначе общий. */
export function reportFileName(promoId?: string): string {
  const suffix = promoId ? `-${promoId.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  return `leads${suffix}.xlsx`;
}
