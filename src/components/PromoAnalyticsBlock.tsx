// Per-promo analytics block (D2). Server component — pre-fetches 30-day
// timeline from BFF /analytics/promos/timeline and renders KPI tiles + a
// sparkline. Embedded on /cabinet/[id] above the editor form. Fetch is best-
// effort: when the BFF is unreachable or no events exist, the block silently
// renders a "no data" hint rather than blocking the editor.

import { getPromoTimeline, type PromoTimelineRow } from '@/lib/bff-client';

const DAYS = 30;

export async function PromoAnalyticsBlock({ promoId }: { promoId: string }) {
  let rows: PromoTimelineRow[] = [];
  try {
    rows = await getPromoTimeline(promoId, DAYS);
  } catch {
    rows = [];
  }

  const totalViews   = rows.reduce((a, b) => a + b.views, 0);
  const totalVisible = rows.reduce((a, b) => a + b.views_visible, 0);
  const totalClicks  = rows.reduce((a, b) => a + b.cta_clicks, 0);
  const ctr = totalVisible > 0 ? Math.round((totalClicks / totalVisible) * 1000) / 10 : 0;
  const peak = rows.reduce((a, b) => (b.views_visible > a.views_visible ? b : a), { day: '', views: 0, views_visible: 0, cta_clicks: 0 });
  const maxBar = Math.max(1, ...rows.map((r) => r.views_visible));
  const hasData = rows.length > 0 && totalViews > 0;

  return (
    <section className="ppa">
      <div className="ppa-head">
        <div>
          <div className="ppa-overline mono">АНАЛИТИКА ПРОМО · {DAYS} ДНЕЙ</div>
          <div className="ppa-title">Как это промо работает</div>
        </div>
        <div className="ppa-peak">
          {hasData ? (
            <>
              <div className="ppa-overline mono">ПИК</div>
              <div className="ppa-peak-num mono">{peak.views_visible.toLocaleString('ru-RU')}</div>
              <div className="ppa-peak-day mono">{shortDate(peak.day)}</div>
            </>
          ) : null}
        </div>
      </div>

      <div className="ppa-kpis">
        <PpaKpi label="ПОКАЗАНО"      value={totalViews}   />
        <PpaKpi label="РЕАЛЬНО ВИДЕЛИ" value={totalVisible} tone="ok" />
        <PpaKpi label="КЛИКИ"         value={totalClicks}  tone="ok" />
        <PpaKpi label="CTR"           value={ctr}          suffix="%" tone={ctr >= 2 ? 'ok' : 'warn'} />
      </div>

      {hasData ? (
        <div className="ppa-spark">
          {rows.map((r) => (
            <span
              key={r.day}
              className="ppa-bar"
              style={{ height: `${Math.max(2, Math.round((r.views_visible / maxBar) * 60))}px` }}
              title={`${r.day}: ${r.views_visible.toLocaleString('ru-RU')} видимых, ${r.cta_clicks} кликов`}
            />
          ))}
        </div>
      ) : (
        <div className="ppa-empty">Событий пока нет — дашборд обновится, когда промо начнут показывать.</div>
      )}

      <style>{PPA_CSS}</style>
    </section>
  );
}

function PpaKpi({ label, value, suffix, tone }: {
  label: string; value: number; suffix?: string; tone?: 'ok' | 'warn';
}) {
  return (
    <div className="ppa-kpi">
      <div className="ppa-overline mono">{label}</div>
      <div className={`ppa-kpi-value mono${tone ? ` tone-${tone}` : ''}`}>
        {value.toLocaleString('ru-RU')}{suffix ?? ''}
      </div>
    </div>
  );
}

function shortDate(d: string): string {
  if (!d) return '';
  const [, m, day] = d.split('-');
  if (!m || !day) return d;
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]}`;
}

const PPA_CSS = `
.ppa {
  background: linear-gradient(180deg, #faf9f7 0%, #f6f5f3 100%);
  border: 1px solid #dfd1b4;
  border-radius: 20px; padding: 22px 24px;
  display: flex; flex-direction: column; gap: 18px;
}
.ppa .mono { font-family: var(--font-mono); }
.ppa-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ppa-overline { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: var(--app-fg3); }
.ppa-title {
  font-size: 22px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--app-fg1); margin-top: 4px;
}
.ppa-peak { text-align: right; min-width: 100px; }
.ppa-peak-num { font-size: 22px; font-weight: 700; color: var(--app-fg1); line-height: 1.1; }
.ppa-peak-day { font-size: 11px; color: var(--app-fg3); margin-top: 2px; }

.ppa-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.ppa-kpi {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0;
}
.ppa-kpi-value {
  font-size: 22px; font-weight: 700; color: var(--app-fg1);
  font-variant-numeric: tabular-nums;
}
.ppa-kpi-value.tone-ok   { color: var(--status-success); }
.ppa-kpi-value.tone-warn { color: var(--brand-coral-700); }

.ppa-spark {
  display: flex; align-items: flex-end; gap: 4px;
  height: 60px;
}
.ppa-bar { flex: 1; min-width: 4px; background: var(--brand-sea-700); border-radius: 2px; }
.ppa-empty {
  color: var(--app-fg3); font-size: 13px;
  background: #fff; border: 1px dashed var(--app-border2);
  border-radius: 10px; padding: 18px 14px; text-align: center;
}

@media (max-width: 720px) {
  .ppa-kpis { grid-template-columns: repeat(2, 1fr); }
}
`;
