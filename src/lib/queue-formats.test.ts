import { describe, expect, it } from 'vitest';
import { QUEUE_META } from './queue-formats';
import { PROD_SERVED_QUEUES } from './catalogue';

describe('QUEUE_META', () => {
  it('covers all PROD_SERVED_QUEUES', () => {
    const missing = PROD_SERVED_QUEUES.filter((q) => !(q in QUEUE_META));
    expect(missing, `QUEUE_META is missing: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('marks home-banner and home-popup as legacy', () => {
    expect(QUEUE_META['home-banner']?.legacy).toBe(true);
    expect(QUEUE_META['home-popup']?.legacy).toBe(true);
  });

  it('does not mark catalog queues as legacy', () => {
    const catalogQueues = ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing'];
    for (const queue of catalogQueues) {
      expect(QUEUE_META[queue]?.legacy, `${queue} should not be legacy`).toBeFalsy();
    }
  });

  it('defines exact metadata for fixed-format persistent queues', () => {
    expect(QUEUE_META['persistent-topline']).toEqual({
      name: 'persistent-topline',
      label: 'Персистентный топлайн',
      sectionHint: 'Постоянный топлайн-слот витрины',
      servedFormats: ['topline'],
    });
    expect(QUEUE_META['persistent-inline']).toEqual({
      name: 'persistent-inline',
      label: 'Персистентный inline',
      sectionHint: 'Постоянный inline-слот витрины',
      servedFormats: ['inline'],
    });
  });

  it('keeps other queues as display-only metadata without format restrictions', () => {
    for (const [key, meta] of Object.entries(QUEUE_META)) {
      expect(meta.label, `${key}.label`).toBeTruthy();
      expect(meta.sectionHint, `${key}.sectionHint`).toBeTruthy();
      if (key !== 'persistent-topline' && key !== 'persistent-inline') {
        expect(meta).not.toHaveProperty('servedFormats');
      }
    }
  });
});
