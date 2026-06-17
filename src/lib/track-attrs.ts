export interface TrackIntent {
  event: string;
  props: Record<string, string>;
}

function toSnake(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

/** Nearest ancestor (incl. self) with [data-track]; data-track-* become props. */
export function resolveTrackIntent(start: Element | null): TrackIntent | null {
  let el: Element | null = start;
  while (el) {
    if (el instanceof HTMLElement && el.dataset && el.dataset.track) {
      const props: Record<string, string> = {};
      for (const [k, v] of Object.entries(el.dataset)) {
        if (k !== "track" && k.startsWith("track") && typeof v === "string") {
          props[toSnake(k.slice("track".length))] = v;
        }
      }
      return { event: el.dataset.track, props };
    }
    el = el.parentElement;
  }
  return null;
}

const INTERACTIVE = new Set(["BUTTON", "A", "SUMMARY", "LABEL"]);

function isInteractive(el: HTMLElement): boolean {
  if (INTERACTIVE.has(el.tagName)) return true;
  if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") return true;
  const role = el.getAttribute("role");
  if (role && /^(button|link|tab|menuitem|option|switch|checkbox|radio)$/.test(role)) return true;
  if (el.hasAttribute("onclick")) return true;
  return false;
}

function deriveLabel(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim().slice(0, 60);
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 60);
  const title = el.getAttribute("title");
  if (title && title.trim()) return title.trim().slice(0, 60);
  const name = el.getAttribute("name") || el.id;
  if (name) return name.slice(0, 60);
  if (el.tagName === "A") {
    const href = el.getAttribute("href");
    if (href) { try { return new URL(href, "http://x").pathname.slice(0, 60); } catch { return href.slice(0, 60); } }
  }
  return el.tagName.toLowerCase();
}

/** Explicit data-track wins; otherwise emit a generic ui_click for any click on an
 *  interactive element (button/link/role/input/label), with a derived label. */
export function deriveClickIntent(start: Element | null): TrackIntent | null {
  const explicit = resolveTrackIntent(start);
  if (explicit) return explicit;
  let el: Element | null = start;
  while (el) {
    if (el instanceof HTMLElement && isInteractive(el)) {
      const props: Record<string, string> = { label: deriveLabel(el), tag: el.tagName.toLowerCase() };
      const testid = el.getAttribute("data-testid");
      if (testid) props.testid = testid;
      const type = el.getAttribute("type");
      if (type) props.type = type;
      if (el.tagName === "A") {
        const href = el.getAttribute("href");
        if (href) props.href = href.slice(0, 120);
      }
      return { event: "ui_click", props };
    }
    el = el.parentElement;
  }
  return null;
}
