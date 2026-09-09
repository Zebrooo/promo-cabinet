import { describe, expect, it } from 'vitest';
import { validatePushCampaignForm } from './validate';
import { toPushCampaignInput } from './to-persisted';
import { emptyPushCampaignForm, toPushCampaignForm, type PushCampaignFormValues } from '@/lib/push-campaign-schema';
import { fullCoverage } from '@/components/promo-form/schedule-presets';

const valid = (over: Partial<PushCampaignFormValues> = {}): PushCampaignFormValues => ({
  ...emptyPushCampaignForm(),
  title: 'Скидки на шины',
  body: 'До воскресенья −20%',
  url: '/sale/tyres',
  ...over,
});

describe('validatePushCampaignForm', () => {
  it('accepts a minimal valid draft', () => {
    expect(validatePushCampaignForm(valid())).toEqual({});
  });

  it('requires title/body/url with Russian messages and rejects dangerous or malformed links', () => {
    const errors = validatePushCampaignForm(valid({ title: '  ', body: '', url: 'javascript:alert(1)' }));
    expect(errors).toMatchObject({ title: 'Укажите заголовок', body: 'Укажите текст', url: expect.any(String) });
    expect(validatePushCampaignForm(valid({ url: 'sale/tyres' }))).toMatchObject({ url: 'Путь витрины (/listing/123) или http(s)-ссылка' });
    expect(validatePushCampaignForm(valid({ url: 'https://abkhaz-auto.ru/sale' }))).toEqual({});
  });

  it('icon is optional, but must be an http(s) URL when set', () => {
    expect(validatePushCampaignForm(valid({ icon: '' }))).toEqual({});
    expect(validatePushCampaignForm(valid({ icon: 'not a url' }))).toMatchObject({ icon: expect.any(String) });
    expect(validatePushCampaignForm(valid({ icon: 'https://cdn.example.com/i.png' }))).toEqual({});
  });

  it('maps targeting errors to the same paths the targeting filter cards use', () => {
    const errors = validatePushCampaignForm(valid({ targeting: { minAge: -1 } }));
    expect(errors).toMatchObject({ targeting: { minAge: 'Возраст не может быть отрицательным' } });
  });

  it('cleared lifecycle controls do not count as an empty block; guests × lifecycle is rejected', () => {
    expect(validatePushCampaignForm(valid({ lifecycle: { soldWithinDays: undefined } }))).toEqual({});
    expect(validatePushCampaignForm(valid({ audience: 'anonymous', lifecycle: { soldWithinDays: 7 } })))
      .toMatchObject({ lifecycle: expect.stringContaining('гостя') });
    expect(validatePushCampaignForm(valid({ schedule: { daysOfWeek: [], hourStart: 0, hourEnd: 24 } })))
      .toMatchObject({ schedule: { daysOfWeek: 'Выберите хотя бы один день' } });
  });
});

describe('toPushCampaignInput', () => {
  it('drops empty icon/lists, audience "all", full-coverage schedule and empty targeting sub-blocks', () => {
    const out = toPushCampaignInput(valid({
      icon: '  ',
      sections: [],
      audience: 'all',
      schedule: fullCoverage(),
      lifecycle: { hasStalledActive: undefined },
      targeting: { search: { lookbackDays: 30 }, purchases: { purchased: undefined }, visitorClass: undefined, newcomerMaxAgeDays: 5 },
    }));
    expect(out).toEqual({ title: 'Скидки на шины', body: 'До воскресенья −20%', url: '/sale/tyres', targeting: {} });
  });

  it('keeps real targeting and passes the id through for updates', () => {
    const out = toPushCampaignInput(valid({
      id: 'push-1',
      icon: 'https://cdn.example.com/i.png',
      audience: 'authenticated',
      sellerStatus: 'seller',
      sections: ['auto'],
      schedule: { daysOfWeek: [1, 2], hourStart: 9, hourEnd: 18 },
      lifecycle: { soldWithinDays: 7 },
      targeting: { minAge: 18, visitorClass: 'newcomer', newcomerMaxAgeDays: 5 },
    }));
    expect(out).toEqual({
      id: 'push-1', title: 'Скидки на шины', body: 'До воскресенья −20%', url: '/sale/tyres', icon: 'https://cdn.example.com/i.png',
      targeting: { minAge: 18, visitorClass: 'newcomer', newcomerMaxAgeDays: 5 },
      audience: 'authenticated', sellerStatus: 'seller', sections: ['auto'],
      schedule: { daysOfWeek: [1, 2], hourStart: 9, hourEnd: 18 }, lifecycle: { soldWithinDays: 7 },
    });
  });

  it('throws in strict mode on an invalid draft (validate runs first in the form)', () => {
    expect(() => toPushCampaignInput(valid({ title: '' }))).toThrow();
    expect(() => toPushCampaignInput(valid({ title: '' }), { strict: false })).not.toThrow();
  });

  it('round-trips a stored campaign through the form shape', () => {
    const stored = {
      id: 'push-1', title: 'T', body: 'B', url: '/x', targeting: { minAge: 18 }, sections: ['auto'],
      status: 'draft' as const, createdAt: 'a', updatedAt: 'b',
    };
    const form = toPushCampaignForm(stored);
    expect(form).toMatchObject({ id: 'push-1', icon: '', audience: 'all', sections: ['auto'] });
    expect(toPushCampaignInput(form)).toEqual({ id: 'push-1', title: 'T', body: 'B', url: '/x', targeting: { minAge: 18 }, sections: ['auto'] });
  });
});
