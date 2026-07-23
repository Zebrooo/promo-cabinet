import { describe, expect, it } from 'vitest';
import { CANONICAL_ANCHORS, CANONICAL_QUEUES, DEVICE_QUEUES } from './catalogue';

describe('CANONICAL_ANCHORS', () => {
  it('has at least one anchor, each with a non-empty id, label and pages', () => {
    expect(CANONICAL_ANCHORS.length).toBeGreaterThan(0);
    for (const a of CANONICAL_ANCHORS) {
      expect(a.id).toMatch(/\S/);
      expect(a.label).toMatch(/\S/);
      expect(Array.isArray(a.pages)).toBe(true);
      expect(a.pages.length).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = CANONICAL_ANCHORS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('catalog queues (per-catalog rollout, step B\')', () => {
  const CATALOG_QUEUES = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];

  it('registers all 8 catalog queues with persist:false', () => {
    for (const name of CATALOG_QUEUES) {
      const entry = CANONICAL_QUEUES.find((q) => q.name === name);
      expect(entry, `queue "${name}" must be canonical`).toBeDefined();
      expect(entry?.persist, `queue "${name}" must not persist (rotates per visit)`).toBe(false);
    }
  });

  it('keeps the legacy pre-cutover queues (retire is a separate step D)', () => {
    for (const name of ['home-banner', 'home-popup', 'tooltip', 'cabinet-onboarding']) {
      expect(CANONICAL_QUEUES.some((q) => q.name === name)).toBe(true);
    }
  });

  it('has 12 base + per-device canonical queues with unique names', () => {
    expect(CANONICAL_QUEUES).toHaveLength(12 + DEVICE_QUEUES.length); // 4 legacy + 8 catalog + 24 device
    const names = CANONICAL_QUEUES.map((q) => q.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('site anchors (promo-anchor coverage)', () => {
  it('registers the 9 storefront anchors duplicated from data-onboarding-anchor', () => {
    const ids = CANONICAL_ANCHORS.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([
      'categories-sidebar',
      'listing-price', 'listing-seller',
      'lk-sidebar', 'lk-hero-kpi', 'boost-btn',
      'reklama-wallet', 'reklama-methods', 'reklama-banner',
    ]));
  });

  it('keeps the pre-existing anchors untouched', () => {
    const ids = CANONICAL_ANCHORS.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([
      'home-search', 'listing-cta', 'catalog-filters',
      'campaign-editor-where', 'campaign-editor-what', 'campaign-editor-budget', 'campaign-editor-submit',
    ]));
  });
});

describe('cabinet-onboarding', () => {
  it('registers the cabinet-onboarding queue', () => {
    expect(CANONICAL_QUEUES.some((q) => q.name === 'cabinet-onboarding')).toBe(true);
  });
  it('registers the campaign-editor anchors', () => {
    const ids = CANONICAL_ANCHORS.filter((a) => a.pages.includes('campaign-editor')).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([
      'campaign-editor-where', 'campaign-editor-what', 'campaign-editor-budget', 'campaign-editor-submit',
    ]));
  });
});
