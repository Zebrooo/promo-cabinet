import { describe, expect, it } from 'vitest';
import { toggleEnumValue, OS_OPTIONS, ENVIRONMENT_OPTIONS, DEVICE_BRAND_OPTIONS } from './env-targeting';

describe('toggleEnumValue — контракт чекбоксов env-таргетинга', () => {
  it('отметка добавляет значение', () => {
    expect(toggleEnumValue(undefined, 'ios', true)).toEqual(['ios']);
    expect(toggleEnumValue(['ios'], 'android', true)).toEqual(['ios', 'android']);
  });
  it('повторная отметка не дублирует', () => {
    expect(toggleEnumValue(['ios'], 'ios', true)).toEqual(['ios']);
  });
  it('снятие убирает значение', () => {
    expect(toggleEnumValue(['ios', 'android'], 'ios', false)).toEqual(['android']);
  });
  it('снятие последнего → undefined («показывать всем», конвенция subscriptionLevels)', () => {
    expect(toggleEnumValue(['ios'], 'ios', false)).toBeUndefined();
    expect(toggleEnumValue(undefined, 'ios', false)).toBeUndefined();
  });
});

describe('наборы опций совпадают со схемой (byte-в-byte с BFF)', () => {
  it('значения групп', () => {
    expect(OS_OPTIONS.map((o) => o.value)).toEqual(['ios', 'android']);
    expect(ENVIRONMENT_OPTIONS.map((o) => o.value)).toEqual(['browser', 'telegram', 'pwa', 'app']);
    expect(DEVICE_BRAND_OPTIONS.map((o) => o.value)).toEqual(['iphone', 'android-flagship', 'android-other']);
  });
});
