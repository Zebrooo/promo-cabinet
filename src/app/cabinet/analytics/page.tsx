// Analytics dashboard — Figma "01 · Analytics dashboard" port.
//
// Layout grid (matches Figma at 1440):
//   [Hero KPI (flex 460)] [Sparkline panel (flex 684)]
//   [k2 active]  [k2 conv]  [k2 budget]              (equal thirds)
//   [Funnel (flex 572)]  [Top events (flex 580)]
//
// Data wiring stays the same — calls BFF /analytics/{kpi,top,daily,funnel}
// via service-ticket. Numbers are shown with ru-RU grouping.
import { requireSession } from '@/lib/require-session';
import { getKpi, getTop, getFunnel, getDaily } from '@/lib/bff-client';

export const dynamic = 'force-dynamic';

const FUNNELS = [
  { title: 'Подача объявления', events: ['listing_submit_started', 'listing_submit_published'] },
  { title: 'Покупка пакета рекламы', events: ['boost_open', 'boost_pack_select', 'boost_purchase_success'] },
  { title: 'Подтверждение email', events: ['email_verify_requested', 'email_verify_completed'] },
] as const;

export default async function AnalyticsPage() {
  requireSession();

  const [kpi, top, daily, ...funnels] = await Promise.all([
    safe(() => getKpi(), { dau: 0, wau: 0, mau: 0, events_today: 0, events_7d: 0, events_total: 0 }),
    safe(() => getTop(7, 25), []),
    safe(() => getDaily(30), []),
    ...FUNNELS.map((f) => safe(() => getFunnel([...f.events], 30), [])),
  ] as const);

  const dailyMax = Math.max(1, ...daily.map((d) => d.count));
  const dailyPeak = daily.reduce((a, b) => (b.count > a.count ? b : a), { day: '', count: 0 });
  const top5 = top.slice(0, 5);
  const submitFunnel = funnels[0] ?? [];
  const submitConversion = submitFunnel.length
    ? submitFunnel[submitFunnel.length - 1].conversion_pct
    : null;

  return (
    <div className="analytics">
      <header className="analytics-head">
        <div>
          <h1 className="analytics-title">Аналитика</h1>
          <nav className="analytics-subnav" aria-label="Разделы аналитики">
            <a className="active" href="/cabinet/analytics">Все события</a>
            <a href="/cabinet/analytics/promos">Промо</a>
            <a href="/cabinet/analytics/onboarding">Онбординг</a>
          </nav>
        </div>
        <div className="analytics-period">
          <div className="period-overline">ПЕРИОД</div>
          <div className="period-value">30 дней ▾</div>
        </div>
      </header>

      <div className="analytics-overline">
        ОБЗОР · ОБНОВЛЕНО{' '}
        {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </div>

      <section className="analytics-hero">
        <HeroKpi
          label="СОБЫТИЙ СЕГОДНЯ"
          value={kpi.events_today}
          delta={deltaVsAvg(kpi.events_today, kpi.events_7d / 7)}
          subtitle={`DAU ${kpi.dau.toLocaleString('ru-RU')} · WAU ${kpi.wau.toLocaleString('ru-RU')} · MAU ${kpi.mau.toLocaleString('ru-RU')}`}
          spark={daily.slice(-15).map((d) => d.count)}
        />
        <SparklinePanel
          title="Динамика событий"
          overline="ЗА 30 ДНЕЙ"
          peakValue={dailyPeak.count}
          peakLabel={shortDate(dailyPeak.day)}
          bars={daily.map((d) => d.count)}
          firstLabel={shortDate(daily[0]?.day)}
          midLabel={shortDate(daily[Math.floor(daily.length / 2)]?.day)}
          lastLabel="сегодня"
        />
      </section>

      <section className="kpi-row">
        <KpiTile
          overline="WAU"
          value={kpi.wau.toLocaleString('ru-RU')}
          delta={null}
          deltaTone="ok"
          caption="за 7 дней"
        />
        <KpiTile
          overline="MAU"
          value={kpi.mau.toLocaleString('ru-RU')}
          delta={null}
          deltaTone="ok"
          caption="за 30 дней"
        />
        <KpiTile
          overline="СОБЫТИЙ ВСЕГО"
          value={kpi.events_total.toLocaleString('ru-RU')}
          delta={null}
          deltaTone="ok"
          caption="за всё время"
        />
      </section>

      <section className="bottom-row">
        <FunnelPanel
          overline="ВОРОНКА · 30 ДНЕЙ"
          title={FUNNELS[0].title}
          rows={submitFunnel}
          conversion={submitConversion}
        />
        <TopEventsPanel
          overline="ТОП СОБЫТИЙ · 7 ДНЕЙ"
          title="Что чаще всего происходит"
          rows={top5}
        />
      </section>

      {/* Secondary funnels (boost + email_verify) — same panel style, side by side */}
      <section className="bottom-row">
        {FUNNELS.slice(1).map((f, i) => (
          <FunnelPanel
            key={f.title}
            overline={`ВОРОНКА · 30 ДНЕЙ`}
            title={f.title}
            rows={funnels[i + 1] ?? []}
            conversion={(funnels[i + 1] ?? []).slice(-1)[0]?.conversion_pct ?? null}
          />
        ))}
      </section>

      <style>{ANALYTICS_CSS}</style>
    </div>
  );
}

/* ───────── building blocks ───────── */

function HeroKpi({
  label, value, delta, subtitle, spark,
}: {
  label: string;
  value: number;
  delta: { sign: '+' | '−' | '~'; pct: number } | null;
  subtitle: string;
  spark: number[];
}) {
  const peak = Math.max(1, ...spark);
  return (
    <div className="hero-kpi">
      <div className="hero-kpi-strip" />
      <div className="hero-kpi-overline">{label}</div>
      <div className="hero-kpi-value">{value.toLocaleString('ru-RU')}</div>
      {delta && (
        <div className={`hero-kpi-delta tone-${delta.sign === '+' ? 'ok' : delta.sign === '−' ? 'bad' : 'flat'}`}>
          {delta.sign === '+' ? '↑' : delta.sign === '−' ? '↓' : '·'} {delta.sign === '+' ? '+' : delta.sign === '−' ? '−' : ''}{delta.pct}% к среднему
        </div>
      )}
      <div className="hero-kpi-caption">{subtitle}</div>
      <div className="hero-kpi-spark" aria-hidden>
        {spark.map((v, i) => (
          <span
            key={i}
            className="hsbar"
            style={{ height: `${4 + Math.round((v / peak) * 24)}px` }}
          />
        ))}
      </div>
    </div>
  );
}

function SparklinePanel({
  title, overline, peakValue, peakLabel, bars, firstLabel, midLabel, lastLabel,
}: {
  title: string;
  overline: string;
  peakValue: number;
  peakLabel: string;
  bars: number[];
  firstLabel: string;
  midLabel: string;
  lastLabel: string;
}) {
  const max = Math.max(1, ...bars);
  return (
    <div className="spark-panel">
      <div className="spark-head">
        <div>
          <div className="overline">{overline}</div>
          <div className="h2">{title}</div>
        </div>
        <div className="spark-peak">
          <div className="overline">ПИК</div>
          <div className="peak-num">{peakValue.toLocaleString('ru-RU')}</div>
          <div className="peak-label">{peakLabel}</div>
        </div>
      </div>
      <div className="spark-bars">
        {bars.length === 0 ? (
          <div className="muted">Нет данных за период.</div>
        ) : bars.map((v, i) => (
          <span
            key={i}
            className={`sbar${i === bars.indexOf(Math.max(...bars)) ? ' peak' : ''}`}
            style={{ height: `${4 + Math.round((v / max) * 96)}px` }}
            title={`${v.toLocaleString('ru-RU')}`}
          />
        ))}
      </div>
      <div className="spark-baseline" />
      <div className="spark-axis">
        <span>{firstLabel}</span>
        <span>{midLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

function KpiTile({ overline, value, delta, deltaTone, caption }: {
  overline: string;
  value: string;
  delta: string | null;
  deltaTone: 'ok' | 'bad' | 'flat';
  caption: string;
}) {
  return (
    <div className="kpi-card">
      <div className="overline">{overline}</div>
      <div className="kpi-card-value">{value}</div>
      <div className="kpi-card-bottom">
        {delta && <span className={`kpi-card-delta tone-${deltaTone}`}>{delta}</span>}
        <span className="kpi-card-caption">{caption}</span>
      </div>
    </div>
  );
}

function FunnelPanel({ overline, title, rows, conversion }: {
  overline: string;
  title: string;
  rows: { step: number; event_name: string; sessions: number; conversion_pct: number | null }[];
  conversion: number | null;
}) {
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  return (
    <div className="panel">
      <div className="overline">{overline}</div>
      <div className="h2">{title}</div>
      {rows.length === 0 ? (
        <div className="muted" style={{ marginTop: 16 }}>Нет данных.</div>
      ) : (
        <>
          <div className="funnel-rows">
            {rows.map((r) => (
              <div key={r.step} className="funnel-row">
                <span className="funnel-name">{prettifyEvent(r.event_name)}</span>
                <div className="funnel-track">
                  <div className="funnel-bar" style={{ width: `${(r.sessions / max) * 100}%` }} />
                </div>
                <span className="funnel-num">{r.sessions.toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </div>
          <div className="funnel-conv">
            <span className="overline">CONVERSION</span>
            <span className={`funnel-conv-pct ${(conversion ?? 0) >= 20 ? 'ok' : 'warn'}`}>
              {conversion == null ? '—' : `${conversion}%`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function TopEventsPanel({ overline, title, rows }: {
  overline: string;
  title: string;
  rows: { event_name: string; curr_count: number }[];
}) {
  return (
    <div className="panel">
      <div className="overline">{overline}</div>
      <div className="h2">{title}</div>
      {rows.length === 0 ? (
        <div className="muted" style={{ marginTop: 16 }}>Событий пока нет.</div>
      ) : (
        <div className="top-list">
          {rows.map((r) => (
            <div key={r.event_name} className="top-row">
              <span className="top-name mono">{r.event_name}</span>
              <span className="top-rule" aria-hidden />
              <span className="top-num">{r.curr_count.toLocaleString('ru-RU')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── helpers ───────── */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); }
  catch (e) { console.error('[analytics]', e); return fallback; }
}

function shortDate(d: string | undefined): string {
  if (!d) return '';
  const [, m, day] = d.split('-');
  if (!m || !day) return d;
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]}`;
}

function deltaVsAvg(today: number, avg7: number): { sign: '+' | '−' | '~'; pct: number } | null {
  if (!avg7 || avg7 <= 0) return null;
  const pct = Math.round(((today - avg7) / avg7) * 100);
  if (pct === 0) return { sign: '~', pct: 0 };
  return pct > 0 ? { sign: '+', pct } : { sign: '−', pct: -pct };
}

// "listing_submit_started" → "Открыта форма" etc. Pretty labels for known events.
function prettifyEvent(name: string): string {
  const map: Record<string, string> = {
    listing_submit_started: 'Открыта форма',
    listing_submit_title_filled: 'Заполнен заголовок',
    listing_submit_photo_added: 'Загружено фото',
    listing_submit_published: 'Опубликовано',
    boost_open: 'Открыт буст-шит',
    boost_pack_select: 'Выбран пакет',
    boost_purchase_success: 'Куплен пакет',
    email_verify_requested: 'Запрошен код',
    email_verify_completed: 'Подтверждён email',
  };
  return map[name] ?? name;
}

/* ───────── styles ───────── */

const ANALYTICS_CSS = `
.analytics {
  --gap: 24px;
  display: flex; flex-direction: column; gap: var(--gap);
  padding: 0 0 60px;
  font-family: var(--font-sans);
}
.analytics .overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg4);
}
.analytics .h2 {
  font-size: 22px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--app-fg1); margin-top: 4px;
}
.analytics .mono { font-family: var(--font-mono); }
.analytics .muted { color: var(--app-fg3); font-size: 13px; }

/* ── header row ──────────────────────────────── */
.analytics-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-top: 0;
}
.analytics-title {
  font-family: var(--font-sans);
  font-size: 36px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--app-fg1); margin: 0;
}
.analytics-period {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 10px; padding: 6px 14px;
  min-width: 180px;
}
.period-overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  color: var(--app-fg4);
}
.period-value {
  font-size: 14px; font-weight: 600; color: var(--app-fg1);
  margin-top: 2px; cursor: pointer;
}
.analytics-overline { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: var(--app-fg4); margin-top: -8px; }
.analytics-subnav { display: flex; gap: 4px; margin-top: 14px; }
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
.analytics-subnav a.active { background: var(--brand-sea-100); color: var(--brand-sea-700); }

/* ── hero (KPI + sparkline) ──────────────────── */
.analytics-hero {
  display: grid; grid-template-columns: minmax(440px, 1fr) minmax(0, 1.55fr);
  gap: var(--gap);
}
.hero-kpi {
  position: relative;
  background: linear-gradient(180deg, #faf9f7 0%, #f6f5f3 100%);
  border: 1px solid #dfd1b4;
  border-radius: 20px;
  padding: 24px 24px 22px;
  min-height: 240px;
  display: flex; flex-direction: column; gap: 6px;
}
.hero-kpi-strip {
  position: absolute; left: 24px; top: 24px;
  width: 4px; height: 32px; border-radius: 2px;
  background: var(--brand-sea-700);
}
.hero-kpi-overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg3);
  padding-left: 16px;
}
.hero-kpi-value {
  font-size: 64px; font-weight: 800; letter-spacing: -0.03em;
  line-height: 1; color: var(--app-fg1);
  margin: 18px 0 4px;
  font-variant-numeric: tabular-nums;
}
.hero-kpi-delta {
  display: inline-flex; align-items: center; gap: 4px;
  align-self: flex-start;
  height: 28px; padding: 0 14px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
}
.hero-kpi-delta.tone-ok   { background: var(--status-success-bg); color: var(--status-success); }
.hero-kpi-delta.tone-bad  { background: var(--status-danger-bg);  color: var(--status-danger); }
.hero-kpi-delta.tone-flat { background: var(--app-surface2);      color: var(--app-fg3); }
.hero-kpi-caption {
  font-size: 13px; font-weight: 500; color: var(--app-fg3);
  margin-top: auto;
}
.hero-kpi-spark {
  position: absolute; right: 24px; bottom: 24px;
  display: flex; align-items: flex-end; gap: 4px;
  height: 32px;
}
.hero-kpi-spark .hsbar {
  width: 6px; border-radius: 1px;
  background: var(--brand-sea-600);
}

/* ── sparkline panel (30-day bars) ───────────── */
.spark-panel {
  position: relative;
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 14px; padding: 22px 24px 18px;
  min-height: 240px;
  display: flex; flex-direction: column;
}
.spark-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
}
.spark-peak { text-align: right; min-width: 120px; }
.spark-peak .peak-num {
  font-family: var(--font-mono); font-weight: 700;
  font-size: 22px; color: var(--app-fg1); line-height: 1.1;
}
.spark-peak .peak-label {
  font-family: var(--font-mono); font-weight: 500;
  font-size: 11px; color: var(--app-fg3); margin-top: 2px;
}
.spark-bars {
  flex: 1; margin-top: 18px;
  display: flex; align-items: flex-end; gap: 6px;
  min-height: 100px;
}
.spark-bars .sbar {
  flex: 1; min-width: 8px; max-width: 18px;
  border-radius: 2px;
  background: var(--brand-sea-700);
  transition: height .3s;
}
.spark-bars .sbar.peak { background: var(--brand-coral-600); }
.spark-baseline {
  height: 1px; background: var(--app-border); margin-top: 4px;
}
.spark-axis {
  display: flex; justify-content: space-between;
  margin-top: 8px;
  font-family: var(--font-mono); font-weight: 500;
  font-size: 10px; color: var(--app-fg3);
}

/* ── kpi row (3 mini tiles) ──────────────────── */
.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--gap); }
.kpi-card {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 14px; padding: 17px 19px;
  min-height: 116px;
  display: flex; flex-direction: column;
}
.kpi-card-value {
  font-size: 36px; font-weight: 800; letter-spacing: -0.02em;
  line-height: 1.1; color: var(--app-fg1); margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
.kpi-card-bottom {
  display: flex; align-items: center; gap: 14px;
  margin-top: auto;
}
.kpi-card-delta {
  display: inline-flex; align-items: center;
  height: 22px; padding: 0 12px; border-radius: 999px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
}
.kpi-card-delta.tone-ok   { background: var(--status-success-bg); color: var(--status-success); }
.kpi-card-delta.tone-bad  { background: var(--status-danger-bg);  color: var(--status-danger); }
.kpi-card-delta.tone-flat { background: var(--app-surface2);      color: var(--app-fg3); }
.kpi-card-caption { font-size: 12px; font-weight: 500; color: var(--app-fg3); }

/* ── bottom row (Funnel + Top events) ────────── */
.bottom-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--gap);
}
.panel {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 14px; padding: 22px 24px;
  min-height: 252px;
  display: flex; flex-direction: column;
}

/* funnel rows */
.funnel-rows { margin-top: 22px; display: flex; flex-direction: column; gap: 18px; }
.funnel-row {
  display: grid;
  grid-template-columns: 180px 1fr 56px;
  align-items: center; gap: 14px;
}
.funnel-name {
  font-size: 13px; font-weight: 500; color: var(--app-fg2);
}
.funnel-track {
  height: 14px; background: var(--app-bg);
  border-radius: 4px; overflow: hidden;
}
.funnel-bar {
  height: 100%; background: var(--brand-sea-700);
  border-radius: 4px; transition: width .3s;
}
.funnel-num {
  font-family: var(--font-mono); font-weight: 700;
  font-size: 16px; color: var(--app-fg1);
  text-align: right;
}
.funnel-conv {
  margin-top: auto; padding-top: 16px;
  border-top: 1px solid var(--app-border);
  display: flex; align-items: center; justify-content: space-between;
}
.funnel-conv-pct {
  font-family: var(--font-mono); font-weight: 700;
  font-size: 16px;
}
.funnel-conv-pct.ok   { color: var(--status-success); }
.funnel-conv-pct.warn { color: var(--brand-coral-600); }

/* top events list */
.top-list { margin-top: 22px; display: flex; flex-direction: column; gap: 0; }
.top-row {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  align-items: center; gap: 16px;
  height: 28px;
}
.top-name {
  font-family: var(--font-mono); font-weight: 500;
  font-size: 13px; color: var(--app-fg2);
}
.top-rule {
  height: 1px; background: var(--app-border);
}
.top-num {
  font-family: var(--font-mono); font-weight: 700;
  font-size: 18px; color: var(--app-fg1);
}

/* ── responsive — mobile (matches Figma 04) ──── */
@media (max-width: 880px) {
  .analytics-hero,
  .kpi-row,
  .bottom-row {
    grid-template-columns: 1fr;
  }
  .analytics-title { font-size: 28px; }
  .hero-kpi-value { font-size: 52px; }
  .hero-kpi-spark { display: none; }
}
`;
