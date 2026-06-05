/**
 * Server-side helper that proxies the cabinet's enhance request to the BFF
 * (`POST /enhance-promo`). Lives outside the request handler so it's easy to
 * mock in tests (pass `fetchImpl`). Bearer auth today; replace with a service-
 * ticket header once the cabinet ships a signing key (see TODO below).
 */
import { createPrivateKey, sign as edSign } from 'node:crypto';
import { env } from '@/env';

// Service-ticket signing — same pattern as bff-client.ts so we reuse the same
// PROMO_TICKET_* env vars and the BFF accepts both endpoints identically.
const TICKET_PREFIX = 'st1';
function loadPrivate(b64: string) {
  return createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
}
function issueServiceTicket(): string | null {
  const privateKey = process.env.PROMO_TICKET_PRIVATE_KEY ?? '';
  if (!privateKey) return null;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60;
  const payload = {
    src: process.env.PROMO_TICKET_SRC ?? 'promo-cabinet',
    dst: process.env.PROMO_TICKET_DST ?? 'promo-bff',
    iat,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${TICKET_PREFIX}.${body}`;
  const sig = edSign(null, Buffer.from(signingInput), loadPrivate(privateKey)).toString('base64url');
  return `${signingInput}.${sig}`;
}

export interface EnhanceRequest {
  advertiserId: string;
  draft: {
    title?: string;
    description?: string;
    action?: { href?: string; label?: string };
    [key: string]: unknown;
  };
}

export interface EnhanceBffResponse {
  status: 'ok' | 'error';
  data?: {
    suggestions: { title?: string; description?: string; action?: { label?: string } };
    cacheHit: boolean;
    model: string;
  };
  reason?: string;
}

export interface AiBffOptions {
  /** Injected fetch — tests pass a vi.fn(); prod gets the global. */
  fetchImpl?: typeof fetch;
  /** Per-call timeout (ms). The whole BFF round-trip — OpenRouter included —
   *  can take ~5–15s for slow models, so we allow a generous cap. */
  timeoutMs?: number;
}

export class AiBffError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AiBffError';
  }
}

export async function callEnhanceBff(req: EnhanceRequest, opts: AiBffOptions = {}): Promise<EnhanceBffResponse> {
  if (!env.promoBffUrl) {
    throw new AiBffError('bff_disabled', 'PROMO_BFF_URL is not configured');
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 45000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Production BFF (eremin.site) requires Ed25519 service-ticket auth — same
  // signing setup as bff-client.ts. Fall back to bearer for environments that
  // haven't shipped the signing key yet (local dev without ticket support).
  const ticket = issueServiceTicket();
  if (ticket) headers['x-service-ticket'] = ticket;
  else if (env.promoBffAuthBearer) headers['Authorization'] = `Bearer ${env.promoBffAuthBearer}`;

  let resp: Response;
  try {
    resp = await fetchImpl(`${env.promoBffUrl}/enhance-promo`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError') throw new AiBffError('timeout', `BFF call timed out after ${timeoutMs}ms`);
    throw new AiBffError('network', `BFF call failed: ${(err as Error).message}`);
  }
  clearTimeout(timer);

  if (resp.status === 401) throw new AiBffError('unauthorized', 'BFF rejected our auth header');
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new AiBffError('bff_error', `BFF ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
  }
  const json = (await resp.json()) as EnhanceBffResponse;
  return json;
}
