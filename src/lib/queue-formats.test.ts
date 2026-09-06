import { describe, expect, it } from 'vitest';
import { QUEUE_META, queueAllowsFormat } from './queue-formats';
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

  it('points transport promoline placement to the dedicated persistent queue', () => {
    expect(QUEUE_META.transport?.sectionHint).toBe(
      'Авто, шины, диски и запчасти; promoline — в очереди «Персистентный промолайн»',
    );
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
    expect(QUEUE_META['persistent-promoline']).toEqual({
      name: 'persistent-promoline',
      label: 'Персистентный промолайн',
      sectionHint: 'Постоянный промолайн между объявлениями витрины',
      servedFormats: ['promoline'],
    });
  });

  it('keeps other queues as display-only metadata without format restrictions', () => {
    for (const [key, meta] of Object.entries(QUEUE_META)) {
      expect(meta.label, `${key}.label`).toBeTruthy();
      expect(meta.sectionHint, `${key}.sectionHint`).toBeTruthy();
      if (key !== 'persistent-topline' && key !== 'persistent-inline' && key !== 'persistent-promoline') {
        expect(meta).not.toHaveProperty('servedFormats');
      }
    }
  });

  it('enforces servedFormats only for fixed-format queues', () => {
    expect(queueAllowsFormat('persistent-promoline', 'promoline')).toBe(true);
    expect(queueAllowsFormat('persistent-promoline', 'inline')).toBe(false);
    expect(queueAllowsFormat('persistent-topline', 'topline')).toBe(true);
    expect(queueAllowsFormat('persistent-topline', 'promoline')).toBe(false);
    expect(queueAllowsFormat('transport', 'popup')).toBe(true);
    expect(queueAllowsFormat('custom-queue', 'multistep')).toBe(true);
  });
});
