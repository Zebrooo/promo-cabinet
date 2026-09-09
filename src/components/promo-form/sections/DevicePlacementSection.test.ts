import { describe, expect, it } from 'vitest';
import { FORMATS_BY_DEVICE } from '@zebrooo/promo-renderer';
import { allowedFormatsFor } from './DevicePlacementSection';

/** promoline — нативный формат @zebrooo/promo-renderer: приходит в тайлы из
 *  FORMATS_BY_DEVICE пакета (на всех устройствах), локально не добавляется. */
describe('allowedFormatsFor — promoline', () => {
  it.each(['desktop', 'touch'] as const)('the package lists promoline for %s', (device) => {
    expect(FORMATS_BY_DEVICE[device]).toContain('promoline');
  });

  it.each(['both', 'desktop', 'touch'] as const)('offers promoline on %s', (target) => {
    expect(allowedFormatsFor(target)).toContain('promoline');
  });

  it('lists promoline exactly once (Set-дедуп)', () => {
    for (const target of ['both', 'desktop', 'touch'] as const) {
      const promoline = allowedFormatsFor(target).filter((f) => f === 'promoline');
      expect(promoline, target).toHaveLength(1);
    }
  });

  it('keeps the device rules of the package formats untouched', () => {
    expect(allowedFormatsFor('touch')).not.toContain('topline');
    expect(allowedFormatsFor('desktop')).toContain('topline');
  });
});
