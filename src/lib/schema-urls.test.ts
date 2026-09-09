import { describe, expect, it } from 'vitest';
import { promoSchema, isSafeHref, isHttpUrl } from './schema';

const base = {
  id: 'x', name: 'X', title: 'X', format: 'inline',
  startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z',
  targeting: {}, cooldownHours: 0,
};

describe('URL fields reject dangerous schemes', () => {
  it('isSafeHref / isHttpUrl', () => {
    expect(isSafeHref('https://x')).toBe(true);
    expect(isSafeHref('/lk/reklama')).toBe(true);
    expect(isSafeHref('#')).toBe(true);
    expect(isSafeHref('tel:+79991234567')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref(' JavaScript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,x')).toBe(false);
    expect(isHttpUrl('https://x/a.png')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects javascript: in action.href but keeps relative and http links', () => {
    expect(promoSchema.safeParse({ ...base, action: { href: 'javascript:alert(1)' } }).success).toBe(false);
    expect(promoSchema.safeParse({ ...base, action: { href: '/lk' } }).success).toBe(true);
    expect(promoSchema.safeParse({ ...base, action: { href: '#' } }).success).toBe(true);
  });

  it('accepts only http(s) for imageUrl, divkitUrl and step images', () => {
    expect(promoSchema.safeParse({ ...base, imageUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(promoSchema.safeParse({ ...base, imageUrl: 'https://cdn/x.png' }).success).toBe(true);
    expect(promoSchema.safeParse({ ...base, format: 'divkit', divkitUrl: 'data:application/json,{}' }).success).toBe(false);
    const steps = [{ title: 'a', body: 'b', imageUrl: 'javascript:1' }, { title: 'c', body: 'd' }];
    expect(promoSchema.safeParse({ ...base, format: 'multistep', steps }).success).toBe(false);
  });

  it('rejects dangerous schemes in backgroundImage', () => {
    expect(promoSchema.safeParse({ ...base, format: 'popup', backgroundImage: 'javascript:1' }).success).toBe(false);
    expect(promoSchema.safeParse({ ...base, format: 'popup', backgroundImage: 'https://cdn/bg.jpg' }).success).toBe(true);
  });
});
