import { cookies } from 'next/headers';
import { requireSession } from '@/lib/require-session';
import { getLeads } from '@/lib/bff-client';
import { readEnvMode } from '@/lib/env-mode';
import { readPool, readQueue, readQueuesIndex } from '@/lib/catalogue';
import {
  campaignOptions,
  LEAD_COLUMNS,
  LEADS_LIMIT,
  moscowDayRange,
  queuesByPromo,
  toRows,
} from '@/lib/leads-report';

export const dynamic = 'force-dynamic';

/**
 * «Лиды» — заявки, которые пользователи витрины отправили из промо кнопкой
 * «Связаться» (спека 2026-08-19-promo-hot-lead-design). Здесь мы видим, сколько
 * лидов принесли рекламодателю; сам отчёт отдаём файлом — кнопка «Скачать
 * Excel» ведёт в /api/leads/export С ТЕМИ ЖЕ параметрами, что стоят в фильтрах,
 * поэтому файл всегда повторяет то, что видно на экране.
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
  // Границы — московские, как и время в таблице (moscowDayRange).
  const { from, to } = moscowDayRange(searchParams.from, searchParams.to);

  let rows: ReturnType<typeof toRows> = [];
  let campaigns: ReturnType<typeof campaignOptions> = [];
  let failed = false;
  try {
    const leads = await getLeads({ promoId, from, to, limit: LEADS_LIMIT });
    // Очередь и список кампаний знает только кабинет — сайт их в заявке не
    // передаёт. Падение S3 не должно ронять страницу: тогда колонка «Очередь»
    // пустая, а в фильтре останутся кампании, по которым уже есть заявки.
    const [queues, promos] = await Promise.all([
      readAllQueues(env).catch(() => new Map<string, string[]>()),
      readPool(env).catch(() => []),
    ]);
    rows = toRows(leads, queues);
    campaigns = campaignOptions(promos, leads, promoId);
  } catch {
    failed = true;
  }

  // Выгрузка получает СЫРЫЕ параметры фильтра (дни, а не ISO): границы периода
  // считает та же moscowDayRange на стороне роута, поэтому ссылку можно просто
  // скопировать из адресной строки и получить тот же набор.
  const exportQuery = new URLSearchParams();
  if (promoId) exportQuery.set('promoId', promoId);
  if (searchParams.from) exportQuery.set('from', searchParams.from);
  if (searchParams.to) exportQuery.set('to', searchParams.to);
  const exportHref = `/api/leads/export${exportQuery.toString() ? `?${exportQuery}` : ''}`;
  const filtered = Boolean(promoId || searchParams.from || searchParams.to);

  return (
    <div>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">АДМИНКА</div>
          <h1>
            Лиды
            {!failed && <span className="count-chip">{rows.length}</span>}
          </h1>
        </div>
        <div className="right">
          <a
            className={`btn btn-primary${rows.length === 0 ? ' is-disabled' : ''}`}
            href={exportHref}
            aria-disabled={rows.length === 0}
          >
            Скачать Excel
          </a>
        </div>
      </div>

      <form className="toolbar" method="get">
        <label className="leads-filter">
          <span className="leads-filter-label">Кампания</span>
          <select className="filter-select" name="promoId" defaultValue={promoId ?? ''}>
            <option value="">Все кампании</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.archived ? ' · архив' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="leads-filter">
          <span className="leads-filter-label">С</span>
          <input className="filter-select" type="date" name="from" defaultValue={searchParams.from ?? ''} />
        </label>

        <label className="leads-filter">
          <span className="leads-filter-label">По</span>
          <input className="filter-select" type="date" name="to" defaultValue={searchParams.to ?? ''} />
        </label>

        <button type="submit" className="btn btn-secondary">Показать</button>
        {filtered && (
          <a className="btn btn-ghost" href="/cabinet/leads">Сбросить</a>
        )}

        {!failed && (
          <span className="result-count">
            {rows.length} {plural(rows.length, 'заявка', 'заявки', 'заявок')}
            {filtered ? ' по фильтру' : ' всего'}
          </span>
        )}
      </form>

      {failed ? (
        <div className="empty">Не удалось получить лиды — BFF недоступен.</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          {filtered
            ? 'По этому фильтру заявок нет — попробуйте другую кампанию или период.'
            : 'Заявок пока нет. Включите у промо «Собирать лиды» в блоке CTA, и они появятся здесь.'}
        </div>
      ) : (
        <>
          {rows.length >= LEADS_LIMIT && (
            <div className="leads-warn">
              Показаны первые {LEADS_LIMIT} заявок — их больше. Сузьте период или
              выберите кампанию, иначе и в таблице, и в выгрузке не хватает части лидов.
            </div>
          )}
          <div className="leads-table-card">
            <div className="aa-table-wrap">
              <table className="aa-table leads-table">
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
                      <td className="leads-when">{row.when}</td>
                      <td>{row.name || <span className="leads-muted">без имени</span>}</td>
                      <td>
                        {/* tel: — чтобы звонить прямо из отчёта, а не копировать руками */}
                        <a className="leads-phone" href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}>
                          {row.phone}
                        </a>
                      </td>
                      <td className="leads-muted mono">{row.promoId}</td>
                      <td>{row.promoTitle || <span className="leads-muted">—</span>}</td>
                      <td>
                        {row.queues
                          ? row.queues.split(', ').map((q) => (
                              <span key={q} className="badge badge-tag">{q}</span>
                            ))
                          : <span className="leads-muted">—</span>}
                      </td>
                      <td className="leads-muted mono">{row.page || '—'}</td>
                      <td>
                        <span className={`badge ${row.delivery === 'Доставлен' ? 'badge-active' : 'badge-inactive'}`}>
                          {row.delivery}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
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
