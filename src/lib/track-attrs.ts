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
