/**
 * Server-side helper that proxies the cabinet's enhance request to the BFF
 * (`POST /enhance-promo`). Lives outside the request handler so it's easy to
 * mock in tests (pass `fetchImpl`). Bearer auth today; replace with a service-
 * ticket header once the cabinet ships a signing key (see TODO below).
 */
import { env } from '@/env';

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
  // TODO(prod auth): when the cabinet ships an Ed25519 signing key, replace this
  // with `X-Service-Ticket: <issueServiceTicket(...)>`. The BFF already supports
  // either (stub or ticket) depending on its own PROMO_TICKET_PUBLIC_KEY env.
  if (env.promoBffAuthBearer) headers['Authorization'] = `Bearer ${env.promoBffAuthBearer}`;

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
