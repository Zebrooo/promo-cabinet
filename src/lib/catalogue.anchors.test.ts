import { describe, expect, it } from 'vitest';
import { CANONICAL_ANCHORS, CANONICAL_QUEUES, DEVICE_QUEUES, PROD_SERVED_QUEUES } from './catalogue';

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

describe('catalog queues (per-device rollout)', () => {
  const CATALOG_QUEUES = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];

  it('does not bootstrap or guard the bare catalog queues — витрина ходит только в `<каталог>-<устройство>`', () => {
    for (const name of CATALOG_QUEUES) {
      expect(CANONICAL_QUEUES.some((q) => q.name === name), `queue "${name}" must not be recreated`).toBe(false);
      expect(PROD_SERVED_QUEUES, `queue "${name}" must be deletable`).not.toContain(name);
    }
  });

  it('keeps every per-device queue both canonical and guarded (это и есть живой контур)', () => {
    for (const { name } of DEVICE_QUEUES) {
      expect(CANONICAL_QUEUES.some((q) => q.name === name), `${name} must be canonical`).toBe(true);
      expect(PROD_SERVED_QUEUES, `${name} must stay guarded`).toContain(name);
    }
  });

  it('keeps the fixed-name queues the storefront still requests', () => {
    for (const name of ['tooltip', 'cabinet-onboarding']) {
      expect(CANONICAL_QUEUES.some((q) => q.name === name)).toBe(true);
      expect(PROD_SERVED_QUEUES).toContain(name);
    }
  });

  it('does not bootstrap or guard home-banner / home-popup — витрина их не запрашивает', () => {
    for (const name of ['home-banner', 'home-popup']) {
      expect(CANONICAL_QUEUES.some((q) => q.name === name), `${name} must not be recreated`).toBe(false);
      expect(PROD_SERVED_QUEUES, `${name} must be deletable`).not.toContain(name);
    }
  });

  it('registers the fixed-format persistent queues as served canonical queues', () => {
    expect(CANONICAL_QUEUES).toEqual(expect.arrayContaining([
      { name: 'persistent-topline', persist: true },
      { name: 'persistent-inline', persist: true },
    ]));
    expect(PROD_SERVED_QUEUES).toEqual(expect.arrayContaining([
      'persistent-topline',
      'persistent-inline',
    ]));
  });

  it('does not know persistent-promoline anymore (витрина её не запрашивала; не пересоздаётся и не под guard-ом)', () => {
    expect(CANONICAL_QUEUES.some((q) => q.name === 'persistent-promoline')).toBe(false);
    expect(PROD_SERVED_QUEUES).not.toContain('persistent-promoline');
  });

  it('has 4 base + per-device canonical queues with unique names', () => {
    expect(CANONICAL_QUEUES).toHaveLength(4 + DEVICE_QUEUES.length); // tooltip + cabinet-onboarding + 2 persistent + 24 device
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
