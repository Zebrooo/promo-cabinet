// /cabinet/analytics/onboarding — Onboarding funnel dashboard.
//
// Third analytics tab. Surfaces the migration-0067 RPCs that were already
// wired through the BFF (/analytics/onboarding/{overview,funnel}) but had no
// UI: how many users start onboarding, how many finish, the buyer/seller role
// split, and per-step advance/abandon/auto-skip. Pure derivations live in
// lib/onboarding-metrics; this page stays a thin server component.
import { requireSession } from '@/lib/require-session';
import { getOnboardingOverview, getOnboardingFunnel } from '@/lib/bff-client';
import {
  completionRate,
  roleSplit,
  stepFlows,
  type OnboardingOverview,
  type StepFlow,
} from '@/lib/onboarding-metrics';

export const dynamic = 'force-dynamic';

const DAYS = 30;

const ZERO_OVERVIEW: OnboardingOverview = {
  welcome_shown: 0, welcome_skipped: 0,
  role_picked: 0, role_buyer: 0, role_seller: 0,
  completed: 0, completed_finished: 0, completed_autoskip: 0,
  skipped_explicit: 0, auto_skipped_steps: 0, restarted: 0,
  step_shown_total: 0, step_next_total: 0,
};

export default async function OnboardingAnalyticsPage() {
  requireSession();

  const [overview, funnel] = await Promise.all([
    safe(() => getOnboardingOverview(DAYS), ZERO_OVERVIEW),
    safe(() => getOnboardingFunnel(DAYS), []),
  ]);

  const conv = completionRate(overview);
  const roles = roleSplit(overview);
  const flows = stepFlows(funnel);
  const maxShown = Math.max(1, ...flows.map((f) => f.shown));
  const empty = overview.welcome_shown === 0 && flows.length === 0;

  return (
    <div className="analytics">
      <header className="analytics-head">
        <div>
          <h1 className="analytics-title">Онбординг</h1>
          <nav className="analytics-subnav" aria-label="Разделы аналитики">
            <a href="/cabinet/analytics">Все события</a>
            <a href="/cabinet/analytics/promos">Промо</a>
            <a className="active" href="/cabinet/analytics/onboarding">Онбординг</a>
          </nav>
        </div>
        <div className="analytics-period">
          <div className="period-overline">ПЕРИОД</div>
          <div className="period-value">{DAYS} дней</div>
        </div>
      </header>

      <div className="analytics-overline">
        ОБЗОР · ОБНОВЛЕНО{' '}
        {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </div>

      {empty ? (
        <div className="ob-empty">Событий онбординга за период нет.</div>
      ) : (
        <>
          {/* 4-up KPI strip ─────────────────────────────────────── */}
          <section className="ob-kpis">
            <ObKpi
              label="ПОКАЗАН ОНБОРДИНГ"
              value={overview.welcome_shown.toLocaleString('ru-RU')}
              caption={`пропустили приветствие: ${overview.welcome_skipped.toLocaleString('ru-RU')}`}
            />
            <ObKpi
              label="ЗАВЕРШИЛИ"
              value={overview.completed.toLocaleString('ru-RU')}
              caption={
                conv == null
                  ? 'нет базы для конверсии'
                  : `конверсия ${conv}% · до конца ${overview.completed_finished.toLocaleString('ru-RU')}, авто ${overview.completed_autoskip.toLocaleString('ru-RU')}`
              }
              tone={conv == null ? undefined : conv >= 50 ? 'ok' : 'warn'}
            />
            <ObKpi
              label="ВЫБРАЛИ РОЛЬ"
              value={overview.role_picked.toLocaleString('ru-RU')}
              caption={
                roles.buyerPct == null
                  ? 'роль ещё не выбирали'
                  : `покупатель ${roles.buyerPct}% · продавец ${roles.sellerPct ?? 0}%`
              }
            />
            <ObKpi
              label="АВТО-СКИП ШАГОВ"
              value={overview.auto_skipped_steps.toLocaleString('ru-RU')}
              caption={
                overview.auto_skipped_steps > 0
                  ? 'шаги, пропущенные системой'
                  : 'система не пропускала шаги'
              }
              tone={overview.auto_skipped_steps > 0 ? 'warn' : 'ok'}
            />
          </section>

          {/* Role split bar ─────────────────────────────────────── */}
          {overview.role_picked > 0 && (
            <section className="panel ob-roles">
              <div className="overline">РОЛИ · ЗА {DAYS} ДНЕЙ</div>
              <div className="ob-roles-bar">
                <div
                  className="ob-roles-seg ob-buyer"
                  style={{ flexBasis: `${roles.buyerPct ?? 0}%` }}
                >
                  <span>покупатель</span>
                </div>
                <div
                  className="ob-roles-seg ob-seller"
                  style={{ flexBasis: `${roles.sellerPct ?? 0}%` }}
                >
                  <span>продавец</span>
                </div>
              </div>
              <div className="ob-roles-legend">
                <span><i className="ob-dot ob-buyer" /> покупатель — <b className="mono">{roles.buyer.toLocaleString('ru-RU')}</b> ({roles.buyerPct ?? 0}%)</span>
                <span><i className="ob-dot ob-seller" /> продавец — <b className="mono">{roles.seller.toLocaleString('ru-RU')}</b> ({roles.sellerPct ?? 0}%)</span>
              </div>
            </section>
          )}

          {/* Per-step funnel ────────────────────────────────────── */}
          <section className="panel">
            <div className="overline">ВОРОНКА ПО ШАГАМ · {DAYS} ДНЕЙ</div>
            <div className="h2">Прохождение шагов</div>
            {flows.length === 0 ? (
              <div className="muted" style={{ marginTop: 16 }}>Шаговых событий нет.</div>
            ) : (
              <>
                <div className="ob-steps">
                  {flows.map((f) => (
                    <StepRow key={f.step_id} flow={f} maxShown={maxShown} />
                  ))}
                </div>
                <div className="ob-steps-legend">
                  <span><i className="ob-dot ob-advanced" /> прошли дальше</span>
                  <span><i className="ob-dot ob-abandoned" /> ушли на шаге</span>
                  <span><i className="ob-dot ob-autoskip" /> авто-скип</span>
                </div>
              </>
            )}
          </section>
        </>
      )}

      <style>{OB_CSS}</style>
    </div>
  );
}

/* ───────── building blocks ───────── */

function ObKpi({ label, value, caption, tone }: {
  label: string; value: string; caption: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className={`ob-kpi${tone ? ` tone-${tone}` : ''}`}>
      <div className="overline">{label}</div>
      <div className="ob-kpi-value">{value}</div>
      <div className="ob-kpi-caption">{caption}</div>
    </div>
  );
}

function StepRow({ flow, maxShown }: { flow: StepFlow; maxShown: number }) {
  const outerW = (flow.shown / maxShown) * 100;
  const seg = (n: number) => (flow.shown > 0 ? (n / flow.shown) * 100 : 0);
  return (
    <div className="ob-step">
      <div className="ob-step-head">
        <span className="ob-step-name mono">{flow.step_idx}. {flow.step_id}</span>
        <span className="ob-step-rate">
          {flow.advanceRate == null ? '—' : `${flow.advanceRate}% дальше`}
        </span>
      </div>
      <div className="ob-step-track" style={{ width: `${outerW}%` }} title={`показан ${flow.shown}`}>
        <div className="ob-seg ob-advanced" style={{ flexBasis: `${seg(flow.advanced)}%` }} />
        <div className="ob-seg ob-abandoned" style={{ flexBasis: `${seg(flow.abandoned)}%` }} />
        <div className="ob-seg ob-autoskip" style={{ flexBasis: `${seg(flow.autoSkipped)}%` }} />
      </div>
      <div className="ob-step-nums mono">
        показан {flow.shown.toLocaleString('ru-RU')} · дальше {flow.advanced.toLocaleString('ru-RU')} · ушли {flow.abandoned.toLocaleString('ru-RU')} · авто {flow.autoSkipped.toLocaleString('ru-RU')}
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); }
  catch (e) { console.error('[onboarding-analytics]', e); return fallback; }
}

/* ───────── styles ───────── */

const OB_CSS = `
.analytics {
  display: flex; flex-direction: column; gap: 24px;
  padding: 0 0 60px;
  font-family: var(--font-sans);
}
.analytics .mono { font-family: var(--font-mono); }
.analytics .muted { color: var(--app-fg3); font-size: 13px; }
.analytics .overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg4);
}
.analytics .h2 {
  font-size: 22px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--app-fg1); margin-top: 4px;
}

/* Header (shared vocabulary with the other analytics tabs) */
.analytics-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
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
.analytics-subnav a.active { background: var(--brand-sea-100); color: var(--brand-sea-700); }
.analytics-period {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 10px; padding: 6px 14px;
  min-width: 140px; flex-shrink: 0;
}
.period-overline { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: var(--app-fg4); }
.period-value { font-size: 14px; font-weight: 600; color: var(--app-fg1); margin-top: 2px; }
.analytics-overline { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: var(--app-fg4); margin-top: -8px; }

.ob-empty { font-size: 14px; color: var(--app-fg3); padding: 24px 0; }

.panel {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 14px; padding: 22px 24px;
  display: flex; flex-direction: column;
}

/* 4-up KPI strip */
.ob-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.ob-kpi {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 14px 18px;
  min-height: 104px;
  display: flex; flex-direction: column; gap: 6px;
}
.ob-kpi-value {
  font-size: 32px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--app-fg1); line-height: 1; margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.ob-kpi-caption { font-size: 12px; color: var(--app-fg3); margin-top: auto; }
.ob-kpi.tone-warn .ob-kpi-value { color: var(--brand-coral-700); }
.ob-kpi.tone-ok .ob-kpi-value { color: var(--app-fg1); }

/* Role split bar */
.ob-roles-bar {
  display: flex; gap: 3px; height: 40px; margin-top: 14px;
}
.ob-roles-seg {
  display: flex; align-items: center; padding: 0 12px;
  border-radius: 6px; min-width: 0;
  font-size: 12px; font-weight: 600; color: #fff;
  overflow: hidden; white-space: nowrap;
}
.ob-roles-seg.ob-buyer  { background: var(--brand-sea-700); }
.ob-roles-seg.ob-seller { background: var(--brand-coral-600); }
.ob-roles-legend {
  display: flex; flex-wrap: wrap; gap: 20px;
  margin-top: 12px; font-size: 13px; color: var(--app-fg2);
}
.ob-dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
.ob-dot.ob-buyer { background: var(--brand-sea-700); }
.ob-dot.ob-seller { background: var(--brand-coral-600); }

/* Per-step funnel */
.ob-steps { margin-top: 22px; display: flex; flex-direction: column; gap: 20px; }
.ob-step { display: flex; flex-direction: column; gap: 6px; }
.ob-step-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ob-step-name { font-size: 13px; font-weight: 600; color: var(--app-fg1); }
.ob-step-rate { font-size: 12px; font-weight: 600; color: var(--app-fg3); white-space: nowrap; }
.ob-step-track {
  display: flex; gap: 2px; height: 16px;
  min-width: 40px; border-radius: 4px; overflow: hidden;
  background: var(--app-bg);
  transition: width .3s;
}
.ob-seg { min-width: 0; height: 100%; }
.ob-seg.ob-advanced  { background: var(--brand-sea-700); }
.ob-seg.ob-abandoned { background: var(--status-danger); }
.ob-seg.ob-autoskip  { background: var(--app-fg4); }
.ob-dot.ob-advanced  { background: var(--brand-sea-700); }
.ob-dot.ob-abandoned { background: var(--status-danger); }
.ob-dot.ob-autoskip  { background: var(--app-fg4); }
.ob-step-nums { font-size: 11px; color: var(--app-fg4); }
.ob-steps-legend {
  display: flex; flex-wrap: wrap; gap: 18px;
  margin-top: 18px; padding-top: 14px;
  border-top: 1px solid var(--app-border);
  font-size: 12px; color: var(--app-fg3);
}

/* Responsive */
@media (max-width: 1080px) { .ob-kpis { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 720px)  {
  .ob-kpis { grid-template-columns: 1fr; }
  .analytics-title { font-size: 28px; }
}
`;
