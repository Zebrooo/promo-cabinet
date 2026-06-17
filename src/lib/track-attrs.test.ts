// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { resolveTrackIntent, deriveClickIntent } from "./track-attrs";

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

describe("deriveClickIntent", () => {
  it("uses data-track when present (explicit wins)", () => {
    const b = document.createElement("button");
    b.dataset.track = "save"; b.dataset.trackId = "5";
    expect(deriveClickIntent(b)).toEqual({ event: "save", props: { id: "5" } });
  });
  it("derives ui_click from a plain button's text", () => {
    const b = document.createElement("button"); b.textContent = "Сохранить";
    expect(deriveClickIntent(b)).toEqual({ event: "ui_click", props: { label: "Сохранить", tag: "button" } });
  });
  it("uses aria-label and captures href for links", () => {
    const a = document.createElement("a");
    a.setAttribute("aria-label", "Открыть"); a.setAttribute("href", "/x");
    expect(deriveClickIntent(a)).toEqual({ event: "ui_click", props: { label: "Открыть", tag: "a", href: "/x" } });
  });
  it("walks up to the nearest interactive ancestor", () => {
    const btn = document.createElement("button"); btn.textContent = "Go";
    const span = document.createElement("span"); btn.appendChild(span);
    expect(deriveClickIntent(span)).toEqual({ event: "ui_click", props: { label: "Go", tag: "button" } });
  });
  it("returns null for non-interactive clicks", () => {
    expect(deriveClickIntent(document.createElement("div"))).toBeNull();
  });
});
