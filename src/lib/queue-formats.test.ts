import { describe, expect, it } from 'vitest';
import { QUEUE_META, queueAllowsFormat } from './queue-formats';
import { PROD_SERVED_QUEUES } from './catalogue';

describe('QUEUE_META', () => {
  it('covers all PROD_SERVED_QUEUES', () => {
    const missing = PROD_SERVED_QUEUES.filter((q) => !(q in QUEUE_META));
    expect(missing, `QUEUE_META is missing: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('marks home-banner and home-popup as queues without a consumer', () => {
    expect(QUEUE_META['home-banner']?.legacy).toBe(true);
    expect(QUEUE_META['home-popup']?.legacy).toBe(true);
  });

  it('marks the bare catalog queues as unread by the storefront — она ходит только в `<каталог>-<устройство>`', () => {
    for (const queue of ['home', 'transport', 'realty', 'goods', 'services', 'jobs', 'news', 'listing']) {
      expect(QUEUE_META[queue]?.legacy, `${queue}: без потребителя`).toBe(true);
      expect(QUEUE_META[queue]?.sectionHint, `${queue}: подсказка ведёт в per-device очереди`)
        .toContain('веб / моб. браузер / приложение');
    }
  });

  it('does NOT mark the per-device queues — их витрина запрашивает (fp/o, fp/promoline)', () => {
    for (const queue of ['transport-web', 'transport-touch', 'transport-mobile', 'home-web']) {
      expect(QUEUE_META[queue]?.legacy, `${queue} обслуживается витриной`).toBeFalsy();
    }
  });

  it('points transport placement to the per-device transport queues (bare `transport` ничего не показывает)', () => {
    expect(QUEUE_META.transport?.sectionHint).toBe(
      'Витрина эту очередь не запрашивает — она ходит в «Транспорт · веб / моб. браузер / приложение». Промо здесь не покажется',
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
    expect(QUEUE_META).not.toHaveProperty('persistent-promoline');
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

  it('enforces servedFormats only for fixed-format queues', () => {
    expect(queueAllowsFormat('persistent-inline', 'inline')).toBe(true);
    expect(queueAllowsFormat('persistent-inline', 'promoline')).toBe(false);
    expect(queueAllowsFormat('persistent-topline', 'topline')).toBe(true);
    expect(queueAllowsFormat('persistent-topline', 'promoline')).toBe(false);
    expect(queueAllowsFormat('transport', 'popup')).toBe(true);
    expect(queueAllowsFormat('custom-queue', 'multistep')).toBe(true);
  });
});
