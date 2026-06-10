/**
 * Тонкий клиент к BFF (promo-bff). Подписывает запросы Ed25519 service-ticket'ом
 * через inline-имплементацию из @zebrooo/service-ticket (полный исходник в
 * /data/promo-bff/node_modules/@zebrooo/service-ticket/dist/index.js).
 *
 * Используется страницей /admin/analytics для получения user-action метрик
 * (KPI / top / funnel / daily). Поверх запускаются админские дашборды.
 */
import { createPrivateKey, sign as edSign } from 'node:crypto';
import type { OnboardingOverview, OnboardingFunnelRow } from './onboarding-metrics';

const TICKET_PREFIX = 'st1';
const SERVICE_TICKET_HEADER = 'x-service-ticket';

function loadPrivate(b64: string) {
  return createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
}

function issueTicket(opts: { src: string; dst: string; privateKey: string; ttlSec?: number }) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + (opts.ttlSec ?? 60);
  const payload = { src: opts.src, dst: opts.dst, iat, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${TICKET_PREFIX}.${body}`;
  const sig = edSign(null, Buffer.from(signingInput), loadPrivate(opts.privateKey)).toString('base64url');
  return `${signingInput}.${sig}`;
}

function bffUrl(): string {
  return process.env.PROMO_BFF_URL ?? 'http://127.0.0.1:3191';
}

function ticket(): string {
  const privateKey = process.env.PROMO_TICKET_PRIVATE_KEY ?? '';
  if (!privateKey) throw new Error('PROMO_TICKET_PRIVATE_KEY not configured');
  return issueTicket({
    src: process.env.PROMO_TICKET_SRC ?? 'promo-cabinet',
    dst: process.env.PROMO_TICKET_DST ?? 'promo-bff',
    privateKey,
  });
}

async function bffPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${bffUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SERVICE_TICKET_HEADER]: ticket(),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`BFF ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

// ── Public API ──────────────────────────────────────────────────────────

export interface KpiData {
  dau: number; wau: number; mau: number;
  events_today: number; events_7d: number; events_total: number;
}
export interface TopRow {
  event_name: string;
  curr_count: number;
  prev_count: number;
  delta_pct: number | null;
}
export interface FunnelRow {
  step: number; event_name: string; sessions: number; conversion_pct: number | null;
}
export interface DailyRow { day: string; count: number }

// Promo analytics (D1/D2) — derived from user_action_events where
// event_name LIKE 'promo_%', see migration 0066.
export interface PromoTopRow {
  promo_id: string;
  title: string | null;
  format: string | null;
  views: number;
  views_visible: number;
  cta_clicks: number;
  closes: number;
  dismisses: number;
  ctr_pct: number;
}
export interface PromoZeroRow {
  promo_id: string;
  title: string | null;
  format: string | null;
  views: number;
  last_seen: string;
}
export interface PromoFunnelByFormatRow {
  format: string;
  views: number;
  views_visible: number;
  cta_clicks: number;
  visible_pct: number;
  ctr_pct: number;
}
export interface PromoTimelineRow {
  day: string;
  views: number;
  views_visible: number;
  cta_clicks: number;
}

export async function getKpi(): Promise<KpiData> {
  return bffPost<KpiData>('/analytics/kpi');
}
export async function getTop(days = 7, limit = 25): Promise<TopRow[]> {
  const { rows } = await bffPost<{ rows: TopRow[] }>('/analytics/top', { days, limit });
  return rows ?? [];
}
export async function getFunnel(events: string[], days = 30): Promise<FunnelRow[]> {
  const { rows } = await bffPost<{ rows: FunnelRow[] }>('/analytics/funnel', { events, days });
  return rows ?? [];
}
export async function getDaily(days = 30): Promise<DailyRow[]> {
  const { rows } = await bffPost<{ rows: DailyRow[] }>('/analytics/daily', { days });
  return rows ?? [];
}

// ── Promo analytics ─────────────────────────────────────────────────────
export async function getPromoTop(days = 30, limit = 25): Promise<PromoTopRow[]> {
  const { rows } = await bffPost<{ rows: PromoTopRow[] }>('/analytics/promos/top', { days, limit });
  return rows ?? [];
}
export async function getPromoZero(days = 30, limit = 25): Promise<PromoZeroRow[]> {
  const { rows } = await bffPost<{ rows: PromoZeroRow[] }>('/analytics/promos/zero', { days, limit });
  return rows ?? [];
}
export async function getPromoFunnelByFormat(days = 30): Promise<PromoFunnelByFormatRow[]> {
  const { rows } = await bffPost<{ rows: PromoFunnelByFormatRow[] }>('/analytics/promos/funnel-by-format', { days });
  return rows ?? [];
}
export async function getPromoTimeline(promoId: string, days = 30): Promise<PromoTimelineRow[]> {
  const { rows } = await bffPost<{ rows: PromoTimelineRow[] }>('/analytics/promos/timeline', { promo_id: promoId, days });
  return rows ?? [];
}

// ── Onboarding analytics (migration 0067) ───────────────────────────────
// overview returns the aggregate object directly; funnel returns { rows }.
// Shapes live in onboarding-metrics.ts (the pure derivations consume them).
export async function getOnboardingOverview(days = 30): Promise<OnboardingOverview> {
  return bffPost<OnboardingOverview>('/analytics/onboarding/overview', { days });
}
export async function getOnboardingFunnel(days = 30): Promise<OnboardingFunnelRow[]> {
  const { rows } = await bffPost<{ rows: OnboardingFunnelRow[] }>('/analytics/onboarding/funnel', { days });
  return rows ?? [];
}
