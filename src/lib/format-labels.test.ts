import { describe, expect, it } from 'vitest';
import { FORMAT_LABEL, formatName } from './format-labels';
import { promoFormats } from './schema';

describe('FORMAT_LABEL', () => {
  it('covers every format in promoFormatSchema', () => {
    const missing = promoFormats.filter((f) => !(f in FORMAT_LABEL));
    expect(missing, `FORMAT_LABEL is missing: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('gives every format a non-empty name and Russian sub', () => {
    for (const format of promoFormats) {
      expect(FORMAT_LABEL[format].name, `${format}.name`).toBeTruthy();
      expect(FORMAT_LABEL[format].sub, `${format}.sub`).toBeTruthy();
    }
  });

  it('labels promoline as the catalogue-feed row', () => {
    expect(FORMAT_LABEL.promoline).toEqual({ name: 'Promoline', sub: 'Строка в ленте каталога' });
  });

  it('keeps promoline distinct from inline in the picker/filter naming', () => {
    expect(FORMAT_LABEL.promoline.name).not.toBe(FORMAT_LABEL.inline.name);
    expect(formatName('promoline')).toBe('Promoline');
  });
});

describe('formatName', () => {
  it('falls back to the raw id for formats the map does not know', () => {
    expect(formatName('banner')).toBe('banner');
  });
});
