"use client";
import { useEffect } from "react";
import { deriveClickIntent } from "@/lib/track-attrs";
import { trackEvent } from "@/lib/analytics";

/** One capture-phase click listener for the whole cabinet. Fires trackEvent for all
 *  interactive element clicks (button/link/role/input/label). Explicit data-track
 *  overrides the auto-derived label. Replaces per-component wiring. */
export function AutoClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const intent = deriveClickIntent(e.target as Element | null);
      if (intent) trackEvent(intent.event, intent.props);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);
  return null;
}
