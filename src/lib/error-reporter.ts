"use client";
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = JSON.stringify({
      service: 'promo-cabinet',
      source: 'browser',
      message: err.message.slice(0, 2048),
      errorType: err.name,
      stack: (err.stack ?? '').slice(0, 16384),
      route: window.location.pathname,
      context: context ?? {},
    });
    const ok =
      typeof navigator !== 'undefined' && 'sendBeacon' in navigator
        ? navigator.sendBeacon('/api/track-error', new Blob([payload], { type: 'application/json' }))
        : false;
    if (!ok) void fetch('/api/track-error', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  } catch { /* never throw */ }
}
