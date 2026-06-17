"use client";
import { useEffect } from "react";
import { resolveTrackIntent } from "@/lib/track-attrs";
import { trackEvent } from "@/lib/analytics";

/** One capture-phase click listener for the whole cabinet. Fires trackEvent for any
 *  element (or ancestor) carrying data-track. Replaces per-component wiring. */
export function AutoClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const intent = resolveTrackIntent(e.target as Element | null);
      if (intent) trackEvent(intent.event, intent.props);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
