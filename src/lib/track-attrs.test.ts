// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveTrackIntent } from "./track-attrs";

describe("resolveTrackIntent", () => {
  it("reads data-track + data-track-* as snake_case props from the clicked node", () => {
    const el = document.createElement("button");
    el.dataset.track = "cta_click";
    el.dataset.trackSource = "hero";
    el.dataset.trackListingId = "42";
    expect(resolveTrackIntent(el)).toEqual({ event: "cta_click", props: { source: "hero", listing_id: "42" } });
  });

  it("walks up to the nearest tracked ancestor", () => {
    const wrap = document.createElement("a");
    wrap.dataset.track = "card_click";
    const inner = document.createElement("span");
    wrap.appendChild(inner);
    expect(resolveTrackIntent(inner)).toEqual({ event: "card_click", props: {} });
  });

  it("returns null when nothing is tracked", () => {
    const el = document.createElement("div");
    expect(resolveTrackIntent(el)).toBeNull();
  });
});
