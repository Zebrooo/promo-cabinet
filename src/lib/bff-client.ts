/**
 * Тонкий клиент к BFF (promo-bff). Подписывает запросы Ed25519 service-ticket'ом
 * через inline-имплементацию из @zebrooo/service-ticket (полный исходник в
 * /data/promo-bff/node_modules/@zebrooo/service-ticket/dist/index.js).
 *
 * Продуктовая аналитика переехала в Яндекс.Метрику — здесь остались показы по
 * промке (getPromoTimeline) + инфра (error/event/referral).
 */
import { createPrivateKey, sign as edSign } from 'node:crypto';

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

async function bffGet<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, value);
  }
  const query = qs.toString();
  const res = await fetch(`${bffUrl()}${path}${query ? `?${query}` : ''}`, {
    headers: { [SERVICE_TICKET_HEADER]: ticket() },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`BFF ${path} returned ${res.status}`);
  return (await res.json()) as T;
}

/** Одна заявка «Связаться» из промо (спека 2026-08-19-promo-hot-lead).
 *  ⚠️ ПДн: телефон и имя человека. Не логировать, не отдавать наружу кабинета. */
export interface Lead {
  createdAt: string;
  promoId: string;
  promoTitle: string;
  page: string;
  name: string;
  phone: string;
}

/** Лиды за период (по убыванию времени). from/to — ISO; промо не задано = все. */
export async function getLeads(params: {
  promoId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<Lead[]> {
  const data = await bffGet<{ leads?: Lead[] }>('/leads', {
    promoId: params.promoId,
    from: params.from,
    to: params.to,
    limit: params.limit ? String(params.limit) : undefined,
  });
  return data.leads ?? [];
}

// Показы по промке — derived from user_action_events where event_name LIKE
// 'promo_%' (migration 0066). Продуктовые метрики → Яндекс.Метрика.
export interface PromoTimelineRow {
  day: string;
  views: number;
  views_visible: number;
  cta_clicks: number;
}

export async function getPromoTimeline(promoId: string, days = 30): Promise<PromoTimelineRow[]> {
  const { rows } = await bffPost<{ rows: PromoTimelineRow[] }>('/analytics/promos/timeline', { promo_id: promoId, days });
  return rows ?? [];
}

// ── Error reporting ──────────────────────────────────────────────────────
export interface BffErrorPayload {
  service: string; source: string; message: string;
  errorType?: string | null; stack?: string | null; release?: string | null;
  route?: string | null; method?: string | null; statusCode?: number | null;
  userId?: string | null; sessionId?: string | null; userAgent?: string | null;
  context?: Record<string, unknown>;
}
export async function reportErrorToBff(payload: BffErrorPayload): Promise<void> {
  await bffPost('/errors', payload as unknown as Record<string, unknown>);
}

// ── Event recording ───────────────────────────────────────────────────────────
export interface BffEventPayload {
  eventName: string; props: Record<string, unknown>;
  pagePath: string | null; sessionId: string | null; userId: string | null; userAgent: string | null;
}
export async function recordEventToBff(payload: BffEventPayload): Promise<void> {
  await bffPost('/events', payload as unknown as Record<string, unknown>);
}

// ── Referral config mirror ──────────────────────────────────────────────
// The cabinet persists promos only to its own S3 pool — it has no creds for
// abkhaz-Supabase. The `referral-invite` custom variant is a config-only
// promo (nothing renders on the site); its fields must additionally land in
// abkhaz's `referral_config` singleton (id=1), which only promo-bff can
// reach. On every save of a referral-invite promo the cabinet calls this
// best-effort sync — a failure here must never block the S3 save (BFF being
// down shouldn't stop admins from editing/queueing promos), see caller.
export interface ReferralConfigSyncPayload {
  active: boolean;
  inviterCreditKopecks: number;
  sellerBonusKopecks: number;
  dailyInviteCap: number;
  holdHours: number;
  dailyBudgetKopecks: number;
}
export async function syncReferralConfigToBff(payload: ReferralConfigSyncPayload): Promise<void> {
  await bffPost('/referral-config/sync', payload as unknown as Record<string, unknown>);
}

// ── Abkhaz Auto: канарейка релиза + эксперименты ─────────────────────────
// В отличие от bffPost() выше, эти ручки МУТИРУЮТ прод-раскатку и штатно
// отвечают 409/503 с телом-объяснением (канарейка не включена / окружение не
// настроено в BFF) — их нужно прозрачно довести до админа, а не превращать в
// generic Error. Поэтому здесь свой тонкий POST, который не бросает на
// не-2xx, а возвращает статус и распарсенное тело как есть; роут-хендлер сам
// решает, как транслировать код наружу.
export interface AaAdminResult<T> {
  status: number;
  body: T;
}

export async function aaAdminPost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<AaAdminResult<T>> {
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
  // BFF всегда отвечает JSON (включая тело ошибки 409/503) — падение здесь
  // означает несовместимый контракт, не штатный кейс, поэтому не глушим.
  const json = (await res.json()) as T;
  return { status: res.status, body: json };
}
