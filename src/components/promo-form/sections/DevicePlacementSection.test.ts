import { describe, expect, it } from 'vitest';
import { allowedFormatsFor } from './DevicePlacementSection';

/** promoline пакет @zebrooo/promo-renderer не знает (витрина рендерит его
 *  inline-рендерером), поэтому формат добавляется в тайлы локально — как
 *  multistep/custom до бампов пакета. Ограничений по устройствам нет. */
describe('allowedFormatsFor — promoline', () => {
  it.each(['both', 'desktop', 'touch'] as const)('offers promoline on %s', (target) => {
    expect(allowedFormatsFor(target)).toContain('promoline');
  });

  it('lists promoline exactly once (Set-дедуп на случай, если пакет его узнает)', () => {
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
