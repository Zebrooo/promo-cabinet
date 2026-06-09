import { describe, expect, it } from 'vitest';
import { CANONICAL_ANCHORS } from './catalogue';

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
