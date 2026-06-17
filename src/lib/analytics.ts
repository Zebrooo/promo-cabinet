"use client";
// Cabinet telemetry — ported from abkhaz-auto analytics.ts.
// Key differences vs site version:
//   - No Yandex.Metrica (admin tool; no UX heatmaps needed)
//   - Session cookie name: pc_sid  (vs aa_sid on site)
//   - Beacon target: /api/track    (cabinet's own route)
//
// Best-effort: never throws into the app.

const SESSION_COOKIE = "pc_sid";
const TTL_DAYS = 30;
let cache: string | null = null;

function getSessionId(): string {
  if (cache) return cache;
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (m) { cache = decodeURIComponent(m[1]); return cache; }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  document.cookie =
    `${SESSION_COOKIE}=${encodeURIComponent(id)}; ` +
    `path=/; max-age=${60 * 60 * 24 * TTL_DAYS}; samesite=lax`;
  cache = id;
  return id;
}

/** Track a cabinet UI action. name = snake_case, props = flat primitives, ≤2KB.
 *
 *  Examples:
 *    trackEvent("cabinet_page_view", { page: "/cabinet" });
 *    trackEvent("promo_save_success", { promo_id: "summer-sale", format: "popup" });
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({
      event_name: name,
      props: props ?? {},
      page_path: window.location.pathname,
      session_id: getSessionId(),
    });
    const ok =
      typeof navigator !== "undefined" && "sendBeacon" in navigator
        ? navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }))
        : false;
    if (!ok) {
      void fetch("/api/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* never throw */ }
}
