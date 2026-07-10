import { describe, expect, it } from 'vitest';
import {
  QUEUE_META,
  formatsServedBy,
  queuesServing,
  isFormatMismatch,
} from './queue-formats';
import { PROD_SERVED_QUEUES } from './catalogue';
import type { PromoFormat } from './queue-formats';

// ─── QUEUE_META structure ────────────────────────────────────────────────────

describe('QUEUE_META', () => {
  it('covers all PROD_SERVED_QUEUES', () => {
    const missing = PROD_SERVED_QUEUES.filter((q) => !(q in QUEUE_META));
    expect(missing, `QUEUE_META is missing: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('marks home-banner and home-popup as legacy', () => {
    expect(QUEUE_META['home-banner']?.legacy).toBe(true);
    expect(QUEUE_META['home-popup']?.legacy).toBe(true);
  });

  it('does NOT mark catalog queues as legacy', () => {
    const catalogQueues = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];
    for (const q of catalogQueues) {
      expect(QUEUE_META[q]?.legacy, `${q} should not be legacy`).toBeFalsy();
    }
  });

  it('every entry has a non-empty label and sectionHint', () => {
    for (const [key, meta] of Object.entries(QUEUE_META)) {
      expect(meta.label, `${key}.label`).toBeTruthy();
      expect(meta.sectionHint, `${key}.sectionHint`).toBeTruthy();
    }
  });
});

// ─── formatsServedBy ─────────────────────────────────────────────────────────

describe('formatsServedBy', () => {
  it('returns catalog formats for a catalog queue', () => {
    const formats = formatsServedBy('home');
    expect(formats).toContain('topline');
    expect(formats).toContain('popup');
    expect(formats).toContain('fullscreen');
    expect(formats).toContain('inline');
    expect(formats).toContain('divkit');
    // multistep is NOT served by catalog queues
    expect(formats).not.toContain('multistep');
  });

  it('returns only tooltip for the tooltip queue', () => {
    expect(formatsServedBy('tooltip')).toEqual(['tooltip']);
  });

  it('returns custom+multistep+tooltip+popup for cabinet-onboarding', () => {
    const formats = formatsServedBy('cabinet-onboarding');
    expect(formats).toContain('custom');
    expect(formats).toContain('multistep');
    expect(formats).toContain('tooltip');
    expect(formats).toContain('popup');
  });

  it('returns null for an unknown/custom queue name', () => {
    expect(formatsServedBy('some-custom-queue-xyz')).toBeNull();
  });

  it('returns formats for legacy queues too (legacy is a display concern only)', () => {
    expect(formatsServedBy('home-banner')).toContain('topline');
    expect(formatsServedBy('home-popup')).toContain('popup');
  });
});

// ─── queuesServing ───────────────────────────────────────────────────────────

describe('queuesServing', () => {
  it('includes all catalog queues for topline', () => {
    const queues = queuesServing('topline');
    const catalogs = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];
    for (const q of catalogs) {
      expect(queues, `topline should be served by ${q}`).toContain(q);
    }
  });

  it('does NOT include legacy queues', () => {
    const queues = queuesServing('topline');
    expect(queues).not.toContain('home-banner');
    const queuesPopup = queuesServing('popup');
    expect(queuesPopup).not.toContain('home-popup');
  });

  it('returns tooltip and cabinet-onboarding for tooltip format', () => {
    const queues = queuesServing('tooltip');
    expect(queues).toContain('tooltip');
    expect(queues).toContain('cabinet-onboarding');
  });

  it('returns cabinet-onboarding for multistep (and NOT catalog queues)', () => {
    const queues = queuesServing('multistep');
    expect(queues).toContain('cabinet-onboarding');
    const catalogs = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];
    for (const q of catalogs) {
      expect(queues, `multistep should NOT be served by catalog queue ${q}`).not.toContain(q);
    }
  });

  it('returns cabinet-onboarding for custom format', () => {
    expect(queuesServing('custom')).toContain('cabinet-onboarding');
  });
});

// ─── isFormatMismatch ────────────────────────────────────────────────────────

describe('isFormatMismatch', () => {
  it('returns false for a matching format (topline in home)', () => {
    expect(isFormatMismatch('home', 'topline')).toBe(false);
  });

  it('returns true for a mismatching format (multistep in home)', () => {
    expect(isFormatMismatch('home', 'multistep')).toBe(true);
  });

  it('returns true for custom in a catalog queue', () => {
    expect(isFormatMismatch('transport', 'custom')).toBe(true);
  });

  it('returns false for tooltip in the tooltip queue', () => {
    expect(isFormatMismatch('tooltip', 'tooltip')).toBe(false);
  });

  it('returns true for topline in the tooltip queue', () => {
    expect(isFormatMismatch('tooltip', 'topline')).toBe(true);
  });

  it('returns false for unknown queue (no false positives for custom queues)', () => {
    expect(isFormatMismatch('my-custom-queue', 'popup')).toBe(false);
  });

  it('returns false for popup in cabinet-onboarding (it is served)', () => {
    expect(isFormatMismatch('cabinet-onboarding', 'popup')).toBe(false);
  });

  it('returns true for divkit in cabinet-onboarding (not served)', () => {
    expect(isFormatMismatch('cabinet-onboarding', 'divkit')).toBe(true);
  });

  // All catalog queues cover all catalog formats
  const catalogQueues = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];
  const catalogFormats: PromoFormat[] = ['topline', 'popup', 'fullscreen', 'inline', 'divkit'];

  for (const q of catalogQueues) {
    for (const f of catalogFormats) {
      it(`no mismatch: ${f} in ${q}`, () => {
        expect(isFormatMismatch(q, f)).toBe(false);
      });
    }
  }
});
