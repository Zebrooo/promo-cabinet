// /cabinet/analytics/promos — Ops console layout.
//
// Принцип: один взгляд → весь оперативный пульт. Сверху 4 KPI плотной полосой,
// под ними одна полоса-воронка по форматам (stacked bar пропорционально
// показам), ниже — плотная таблица всех промо с zebra-stripes, mono-числами,
// цветом по CTR и подсветкой нулевых-CTR строк (потеря — деньги на полу).
//
// Цели:
//   1. Видно 12+ промо без скролла на десктопе.
//   2. Колонки выровнены, mono-числа легко сравнивать визуально.
//   3. Нулевые/слабые промо физически выделены (другой фон / цвет CTR).
//
// Данные: всё ещё через BFF /analytics/promos/{top,zero,funnel-by-format}
// (миграция 0066). Сортировка идёт по views_visible desc (то что реально
// видели — главная метрика).

import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import {
  getPromoTop,
  getPromoZero,
  getPromoFunnelByFormat,
  type PromoTopRow,
  type PromoZeroRow,
  type PromoFunnelByFormatRow,
} from '@/lib/bff-client';

export const dynamic = 'force-dynamic';

const DAYS = 30;
const FORMAT_LABEL: Record<string, string> = {
  topline: 'topline', inline: 'inline', popup: 'popup', fullscreen: 'fullscreen',
};

export default async function PromoAnalyticsPage() {
  requireSession();

  const [top, zero, funnel] = await Promise.all([
    safe(() => getPromoTop(DAYS, 30), [] as PromoTopRow[]),
    safe(() => getPromoZero(DAYS, 30), [] as PromoZeroRow[]),
    safe(() => getPromoFunnelByFormat(DAYS), [] as PromoFunnelByFormatRow[]),
  ]);

  const totalViewsVisible = top.reduce((a, b) => a + b.views_visible, 0);
  const totalViews        = top.reduce((a, b) => a + b.views, 0);
  const totalClicks       = top.reduce((a, b) => a + b.cta_clicks, 0);
  const overallCtr        = totalViewsVisible ? round1((totalClicks / totalViewsVisible) * 100) : 0;
  const zeroCount         = zero.length;
  const funnelTotal       = funnel.reduce((a, b) => a + b.views, 0) || 1;

  return (
    <div className="analytics">
      <header className="analytics-head">
        <div>
          <h1 className="analytics-title">Промо</h1>
          <nav className="analytics-subnav" aria-label="Разделы аналитики">
            <a href="/cabinet/analytics">Все события</a>
            <a className="active" href="/cabinet/analytics/promos">Промо</a>
            <a href="/cabinet/analytics/onboarding">Онбординг</a>
          </nav>
        </div>
        <div className="analytics-period">
          <div className="period-overline">ПЕРИОД</div>
          <div className="period-value">{DAYS} дней</div>
        </div>
      </header>

      {/* 4-up KPI strip ───────────────────────────────────────────── */}
      <section className="ops-kpis">
        <OpsKpi label="ВИДИМЫХ ПОКАЗОВ" value={totalViewsVisible.toLocaleString('ru-RU')} caption={`из ${totalViews.toLocaleString('ru-RU')} рендеров`} />
        <OpsKpi label="КЛИКИ ПО CTA"    value={totalClicks.toLocaleString('ru-RU')}        caption="суммарно" />
        <OpsKpi
          label="CTR ОБЩИЙ"
          value={`${overallCtr}%`}
          caption={overallCtr >= 2 ? 'выше 2% — норма' : 'ниже 2% — слабо'}
          tone={overallCtr >= 2 ? 'ok' : 'warn'}
        />
        <OpsKpi
          label="НУЛЕВОЙ CTR"
          value={zeroCount.toLocaleString('ru-RU')}
          caption={zeroCount > 0 ? 'промо без единого клика' : 'все промо получают клики'}
          tone={zeroCount > 0 ? 'alert' : 'ok'}
        />
      </section>

      {/* Format funnel — single stacked bar ──────────────────────── */}
      <section className="ops-funnel-wrap">
        <div className="overline">ВОРОНКА · ПО ФОРМАТАМ</div>
        {funnel.length === 0 ? (
          <div className="ops-empty">Промо-событий нет.</div>
        ) : (
          <div className="ops-funnel">
            <div className="ops-funnel-bar">
              {funnel.map((f) => {
                const w = (f.views / funnelTotal) * 100;
                return (
                  <div
                    key={f.format}
                    className={`ops-funnel-seg fmt-${f.format}`}
                    style={{ flexBasis: `${w}%` }}
                  >
                    <span className="ops-funnel-name">{f.format}</span>
                  </div>
                );
              })}
            </div>
            <div className="ops-funnel-legend">
              {funnel.map((f) => (
                <div key={f.format} className="ops-funnel-leg">
                  <span className={`ops-funnel-dot fmt-${f.format}`} />
                  <span className="ops-funnel-leg-name">{FORMAT_LABEL[f.format] ?? f.format}</span>
                  <span className="ops-funnel-leg-num mono">
                    {f.views.toLocaleString('ru-RU')} · CTR {round1(f.ctr_pct)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Dense promos table ──────────────────────────────────────── */}
      <section className="ops-table-wrap">
        <div className="ops-table-head">
          <div className="overline">ВСЕ ПРОМО · {DAYS} ДНЕЙ · СОРТИРОВКА ПО ВИДИМЫМ</div>
          <div className="ops-table-meta mono">{top.length} строк</div>
        </div>

        {top.length === 0 ? (
          <div className="ops-empty">Промо-событий нет.</div>
        ) : (
          <div className="ops-table" role="table" aria-label="Все промо за период">
            <div className="ops-row ops-row-head" role="row">
              <div role="columnheader">Промо</div>
              <div role="columnheader">Формат</div>
              <div role="columnheader" className="num">Показано</div>
              <div role="columnheader" className="num">Видно</div>
              <div role="columnheader" className="num">Клики</div>
              <div role="columnheader" className="num">CTR</div>
              <div role="columnheader" />
            </div>

            {top.map((r, i) => {
              const isZero = r.cta_clicks === 0 && r.views_visible > 0;
              const ctrTone = r.ctr_pct === 0 ? 'zero' : r.ctr_pct >= 4 ? 'ok' : r.ctr_pct >= 2 ? 'mid' : 'warn';
              return (
                <Link
                  key={r.promo_id}
                  href={`/cabinet/${encodeURIComponent(r.promo_id)}`}
                  role="row"
                  className={`ops-row${i % 2 === 1 ? ' zebra' : ''}${isZero ? ' is-zero' : ''}`}
                >
                  <div className="ops-cell ops-cell-title" role="cell">
                    <div className="ops-title">{r.title ?? r.promo_id}</div>
                    <div className="ops-id mono">{r.promo_id}</div>
                  </div>
                  <div role="cell">
                    {r.format && <span className={`fmt-pill fmt-${r.format}`}>{r.format}</span>}
                  </div>
                  <div role="cell" className="num mono">{r.views.toLocaleString('ru-RU')}</div>
                  <div role="cell" className="num mono strong">{r.views_visible.toLocaleString('ru-RU')}</div>
                  <div role="cell" className={`num mono strong ${isZero ? 'zero' : ''}`}>{r.cta_clicks.toLocaleString('ru-RU')}</div>
                  <div role="cell" className={`num mono strong ctr-${ctrTone}`}>{round1(r.ctr_pct)}%</div>
                  <div role="cell" className="ops-arrow">→</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <style>{OPS_CSS}</style>
    </div>
  );
}

function OpsKpi({ label, value, caption, tone }: {
  label: string; value: string; caption: string;
  tone?: 'ok' | 'warn' | 'alert';
}) {
  return (
    <div className={`ops-kpi${tone ? ` tone-${tone}` : ''}`}>
      <div className="overline">{label}</div>
      <div className="ops-kpi-value">{value}</div>
      <div className="ops-kpi-caption">{caption}</div>
    </div>
  );
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); }
  catch (e) { console.error('[promo-analytics]', e); return fallback; }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const OPS_CSS = `
.analytics {
  display: flex; flex-direction: column; gap: 24px;
  padding: 0 0 60px;
  font-family: var(--font-sans);
}
.analytics .mono { font-family: var(--font-mono); }
.analytics .strong { font-weight: 700; }
.analytics .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.analytics .overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg4);
}

/* ── Header (title + subnav + period selector) ─────────────── */
.analytics-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px;
}
.analytics-title {
  font-family: var(--font-sans);
  font-size: 36px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--app-fg1); margin: 0 0 14px;
}
.analytics-subnav { display: flex; gap: 4px; }
.analytics-subnav a {
  display: inline-flex; align-items: center;
  height: 32px; padding: 0 14px;
  font-size: 13px; font-weight: 600;
  color: var(--app-fg3);
  border-radius: 999px;
  text-decoration: none;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.analytics-subnav a:hover { background: var(--app-surface2); color: var(--app-fg1); text-decoration: none; }
.analytics-subnav a.active { background: #FCDFE2; color: #B91220; }

.analytics-period {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 10px; padding: 6px 14px;
  min-width: 140px; flex-shrink: 0;
}
.period-overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  color: var(--app-fg4);
}
.period-value {
  font-size: 14px; font-weight: 600; color: var(--app-fg1);
  margin-top: 2px;
}

/* Format colors — shared between funnel + table pills */
.fmt-pill {
  display: inline-flex; align-items: center;
  height: 22px; padding: 0 10px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
  background: var(--app-border); color: var(--app-fg2);
  text-transform: lowercase;
}
.fmt-pill.fmt-topline    { background: #FCDFE2; color: #B91220; }
.fmt-pill.fmt-inline     { background: #ECECEF; color: #3A3F48; }
.fmt-pill.fmt-popup      { background: #F4EBD9; color: #43382A; }
.fmt-pill.fmt-fullscreen { background: #FBE0D4; color: #C44321; }

/* ── 4-up KPI strip ────────────────────────────────────────── */
.ops-kpis {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.ops-kpi {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 14px 18px;
  min-height: 100px;
  display: flex; flex-direction: column; gap: 6px;
}
.ops-kpi-value {
  font-size: 32px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--app-fg1); line-height: 1;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}
.ops-kpi-caption { font-size: 12px; color: var(--app-fg3); margin-top: auto; }
.ops-kpi.tone-ok    .ops-kpi-value { color: var(--app-fg1); }
.ops-kpi.tone-warn  .ops-kpi-value { color: var(--brand-coral-700); }
.ops-kpi.tone-alert {
  background: var(--status-danger-bg);
  border-color: #F3C0B9;
}
.ops-kpi.tone-alert .ops-kpi-value { color: var(--status-danger); }
.ops-kpi.tone-alert .ops-kpi-caption { color: var(--status-danger); font-weight: 600; }

/* ── Stacked bar funnel ────────────────────────────────────── */
.ops-funnel-wrap {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 14px 18px 16px;
}
.ops-funnel { margin-top: 12px; }
.ops-funnel-bar {
  display: flex; gap: 2px;
  height: 32px;
}
.ops-funnel-seg {
  display: flex; align-items: center;
  min-width: 0;
  padding: 0 10px;
  border-radius: 4px;
  font-size: 11px; font-weight: 600;
  color: #fff;
  overflow: hidden;
}
.ops-funnel-seg.fmt-topline    { background: #B91220; }
.ops-funnel-seg.fmt-inline     { background: #7A818C; }
.ops-funnel-seg.fmt-popup      { background: #B89673; }
.ops-funnel-seg.fmt-fullscreen { background: #DF5530; }
.ops-funnel-name {
  text-transform: lowercase;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ops-funnel-legend {
  margin-top: 10px;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px 16px;
}
.ops-funnel-leg {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--app-fg2);
}
.ops-funnel-dot {
  width: 8px; height: 8px; border-radius: 2px;
}
.ops-funnel-dot.fmt-topline    { background: #B91220; }
.ops-funnel-dot.fmt-inline     { background: #7A818C; }
.ops-funnel-dot.fmt-popup      { background: #B89673; }
.ops-funnel-dot.fmt-fullscreen { background: #DF5530; }
.ops-funnel-leg-name { font-weight: 600; min-width: 70px; }
.ops-funnel-leg-num { font-size: 11px; color: var(--app-fg4); }

/* ── Dense table ───────────────────────────────────────────── */
.ops-table-wrap {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 14px 18px 18px;
}
.ops-table-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  margin-bottom: 4px;
}
.ops-table-meta { font-size: 11px; color: var(--app-fg4); }
.ops-table {
  margin-top: 10px;
  display: flex; flex-direction: column;
}
.ops-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 110px 110px 90px 100px 28px;
  align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  color: inherit; text-decoration: none;
  transition: background var(--dur-fast);
}
.ops-row > div { white-space: nowrap; min-width: 0; }
.ops-row.ops-row-head {
  padding: 6px 12px 8px;
  border-bottom: 1px solid var(--app-border);
  border-radius: 0;
  font-size: 10px; font-weight: 600;
  /* letter-spacing намеренно меньше чем на других overline'ах — в узких
     столбцах "CTR" + tracking 8% + text-align:right + wrap-protection
     иногда переносило R; 4% хватает чтобы caps читались как заглавия,
     но не перекидывало последний символ. */
  letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--app-fg4);
}
.ops-row.zebra { background: var(--app-bg); }
.ops-row.is-zero { background: var(--status-danger-bg); }
.ops-row:not(.ops-row-head):hover {
  background: var(--app-surface2);
  text-decoration: none;
}
.ops-row.is-zero:hover { background: #FBD3CC; }
.ops-cell-title { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ops-title {
  font-size: 13px; font-weight: 600; color: var(--app-fg1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ops-id { font-size: 10px; color: var(--app-fg4); }
.ops-row .num { font-size: 13px; color: var(--app-fg2); }
.ops-row .num.strong { color: var(--app-fg1); font-size: 14px; }
.ops-row .num.zero { color: var(--status-danger); }
.ops-row .ctr-ok   { color: var(--status-success); }
.ops-row .ctr-mid  { color: var(--brand-coral-600); }
.ops-row .ctr-warn { color: var(--brand-coral-700); }
.ops-row .ctr-zero { color: var(--status-danger); }
.ops-arrow {
  font-size: 14px; color: var(--app-fg4);
  text-align: center;
}
.ops-row:hover .ops-arrow { color: var(--brand-coral-600); }

.ops-empty {
  margin-top: 12px;
  font-size: 13px; color: var(--app-fg3);
}

/* ── Responsive ────────────────────────────────────────────── */
@media (max-width: 1080px) {
  .ops-kpis { grid-template-columns: repeat(2, 1fr); }
  .ops-row {
    grid-template-columns: minmax(0, 1fr) 90px 80px 80px 60px 60px 24px;
    gap: 8px;
    padding: 8px;
  }
}
@media (max-width: 720px) {
  .ops-kpis { grid-template-columns: 1fr; }
  .ops-row {
    grid-template-columns: minmax(0, 1fr) 70px 70px;
    grid-template-areas:
      'title fmt arrow'
      'stats stats stats';
    gap: 6px;
  }
  .ops-row > :nth-child(1) { grid-area: title; }
  .ops-row > :nth-child(2) { grid-area: fmt; }
  .ops-row > :nth-child(7) { grid-area: arrow; }
  .ops-row > :nth-child(3),
  .ops-row > :nth-child(4),
  .ops-row > :nth-child(5),
  .ops-row > :nth-child(6) {
    grid-area: stats;
    display: inline-flex; gap: 12px;
    font-size: 12px;
  }
  .ops-row.ops-row-head { display: none; }
}
`;
