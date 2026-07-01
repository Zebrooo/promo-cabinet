import { describe, expect, it } from 'vitest';
import { CANONICAL_ANCHORS, CANONICAL_QUEUES } from './catalogue';

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
