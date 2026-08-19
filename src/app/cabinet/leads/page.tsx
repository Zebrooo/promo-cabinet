import { cookies } from 'next/headers';
import { requireSession } from '@/lib/require-session';
import { getLeads } from '@/lib/bff-client';
import { readEnvMode } from '@/lib/env-mode';
import { readQueue, readQueuesIndex } from '@/lib/catalogue';
import { LEAD_COLUMNS, queuesByPromo, toRows } from '@/lib/leads-report';

export const dynamic = 'force-dynamic';

/**
 * «Лиды» — заявки, которые пользователи витрины отправили из промо кнопкой
 * «Связаться» (спека 2026-08-19-promo-hot-lead-design). Здесь мы видим, сколько
 * лидов принесли рекламодателю; сам отчёт отдаём файлом (кнопка «Скачать
 * Excel» — /api/leads/export с теми же фильтрами).
 *
 * Телефоны — ПДн: страница за сессией кабинета, наружу ничего не отдаёт.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { promoId?: string; from?: string; to?: string };
}) {
  requireSession();

  const env = readEnvMode(cookies());
  const promoId = searchParams.promoId?.trim() || undefined;
  // Границы периода приходят из <input type="date"> (YYYY-MM-DD). `to`
  // включительно по смыслу пользователя, а в запросе граница строгая — поэтому
  // берём начало следующего дня.
  const from = searchParams.from ? `${searchParams.from}T00:00:00.000Z` : undefined;
  const to = searchParams.to ? nextDayIso(searchParams.to) : undefined;

  let rows: ReturnType<typeof toRows> = [];
  let failed = false;
  try {
    const leads = await getLeads({ promoId, from, to });
    // Очередь знает только кабинет — сайт её в заявке не передаёт. Падение S3
    // не должно ронять страницу: тогда колонка «Очередь» просто пустая.
    const queues = await readAllQueues(env).catch(() => new Map<string, string[]>());
    rows = toRows(leads, queues);
  } catch {
    failed = true;
  }

  const exportQuery = new URLSearchParams();
  if (promoId) exportQuery.set('promoId', promoId);
  if (searchParams.from) exportQuery.set('from', from ?? '');
  if (searchParams.to) exportQuery.set('to', to ?? '');

  return (
    <div>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">АДМИНКА</div>
          <h1>Лиды</h1>
        </div>
        <div className="right">
          <a
            className="btn"
            href={`/api/leads/export${exportQuery.toString() ? `?${exportQuery}` : ''}`}
          >
            Скачать Excel
          </a>
        </div>
      </div>

      <form className="ef-row" method="get" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="ef-field">
          <label htmlFor="lead-promo">Промо</label>
          <input
            id="lead-promo"
            className="ef-input mono"
            name="promoId"
            defaultValue={promoId ?? ''}
            placeholder="id промо — пусто = все"
          />
        </div>
        <div className="ef-field">
          <label htmlFor="lead-from">С</label>
          <input id="lead-from" className="ef-input" type="date" name="from" defaultValue={searchParams.from ?? ''} />
        </div>
        <div className="ef-field">
          <label htmlFor="lead-to">По</label>
          <input id="lead-to" className="ef-input" type="date" name="to" defaultValue={searchParams.to ?? ''} />
        </div>
        <button type="submit" className="btn">Показать</button>
      </form>

      {failed ? (
        <div className="hint hint-warn">Не удалось получить лиды — BFF недоступен.</div>
      ) : (
        <>
          <p className="metrics-intro">
            {rows.length === 0
              ? 'За этот период заявок нет.'
              : `${rows.length} ${plural(rows.length, 'заявка', 'заявки', 'заявок')} за выбранный период.`}
          </p>
          {rows.length > 0 && (
            <div className="aa-table-wrap">
              <table className="aa-table">
                <thead>
                  <tr>
                    {LEAD_COLUMNS.map((c) => (
                      <th key={c.key}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={`${row.promoId}-${row.phone}-${i}`}>
                      {LEAD_COLUMNS.map((c) => (
                        <td key={c.key}>{row[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** `to` в форме — включительный день; в запрос уходит начало следующего. */
function nextDayIso(day: string): string | undefined {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

async function readAllQueues(env: ReturnType<typeof readEnvMode>): Promise<Map<string, string[]>> {
  const index = await readQueuesIndex(env);
  const entries = await Promise.all(
    index.map(async ({ name }) => [name, await readQueue(name, env)] as const),
  );
  return queuesByPromo(Object.fromEntries(entries));
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
