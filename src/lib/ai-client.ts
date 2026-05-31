/** Browser-side helper for `POST /api/enhance`. The cabinet proxies this to
 *  promo-bff /enhance-promo; here we only handle the cabinet's response. */

export interface AiSuggestions {
  title?: string;
  description?: string;
  action?: { label?: string };
}

export interface AiEnhanceSuccess {
  ok: true;
  suggestions: AiSuggestions;
  cacheHit: boolean;
  model: string;
}

export interface AiEnhanceFailure {
  ok: false;
  reason: string;
  /** HTTP status from the cabinet's /api/enhance route, if available. */
  status?: number;
}

export type AiEnhanceResult = AiEnhanceSuccess | AiEnhanceFailure;

export interface AiClientDraft {
  title?: string;
  description?: string;
  action?: { href?: string; label?: string };
}

/** Map technical reason codes (from BFF or the cabinet's route) to readable
 *  Russian strings the UI can show. */
const REASON_LABELS: Record<string, string> = {
  rate_limited: 'Слишком много запросов — попробуйте через несколько минут.',
  openrouter_unavailable: 'AI-сервис временно недоступен — попробуйте ещё раз.',
  malformed_response: 'AI вернул некорректный ответ — попробуйте ещё раз.',
  ai_disabled: 'AI-помощник не настроен (PROMO_BFF_URL пуст).',
  ai_timeout: 'AI-сервис не ответил вовремя — попробуйте ещё раз.',
  ai_unauthorized: 'Не удалось авторизоваться в AI-сервисе. Сообщите администратору.',
  ai_unavailable: 'AI-сервис недоступен — попробуйте позже.',
  unauthorized: 'Сессия истекла — войдите снова.',
};

export function describeAiReason(reason: string): string {
  return REASON_LABELS[reason] ?? `Не удалось получить улучшения (${reason}).`;
}

export async function enhancePromo(
  draft: AiClientDraft,
  init: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<AiEnhanceResult> {
  const fetchImpl = init.fetchImpl ?? fetch;
  let resp: Response;
  try {
    resp = await fetchImpl('/api/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      return { ok: false, reason: 'aborted' };
    }
    return { ok: false, reason: 'network' };
  }

  if (resp.status === 401) return { ok: false, reason: 'unauthorized', status: 401 };

  const json = (await resp.json().catch(() => ({}))) as {
    error?: string;
    status?: 'ok' | 'error';
    reason?: string;
    data?: { suggestions?: AiSuggestions; cacheHit?: boolean; model?: string };
  };

  // Cabinet route emits { error: "..." } on its own failures.
  if (!resp.ok) return { ok: false, reason: json.error ?? 'ai_unavailable', status: resp.status };

  // BFF envelope: { status, data?/reason? }.
  if (json.status === 'error') return { ok: false, reason: json.reason ?? 'ai_unavailable' };
  if (json.status === 'ok' && json.data?.suggestions) {
    return {
      ok: true,
      suggestions: json.data.suggestions,
      cacheHit: !!json.data.cacheHit,
      model: json.data.model ?? '',
    };
  }
  return { ok: false, reason: 'malformed_response' };
}
