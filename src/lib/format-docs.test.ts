import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateFormatDocs } from './format-docs';

/**
 * Drift-тест: docs/promo-format-schemas.md — сгенерированный файл, коммитится
 * в репозиторий как читаемая документация. Если кто-то поменял
 * SCHEMA_BY_FORMAT/CONTENT_KEYS_BY_FORMAT в schema.ts, но не перегенерировал
 * доку — этот тест ловит рассинхрон.
 */
const DOCS_PATH = fileURLToPath(new URL('../../docs/promo-format-schemas.md', import.meta.url));

describe('promo-format-schemas.md (drift)', () => {
  it('matches the freshly generated document — run `npm run docs:formats` if this fails', () => {
    const committed = readFileSync(DOCS_PATH, 'utf8');
    const fresh = generateFormatDocs();
    expect(
      committed,
      'docs/promo-format-schemas.md устарела относительно src/lib/schema.ts. ' +
        'Перегенерируй командой `npm run docs:formats` и закоммить результат.',
    ).toBe(fresh);
  });
});

describe('FIELD_DESCRIPTIONS (описания полей для доки)', () => {
  it('каждое описание относится к существующему пути схемы — протухшее описание мёртвого поля не должно жить в словаре', async () => {
    const { FIELD_DESCRIPTIONS } = await import('./format-docs');
    const fresh = generateFormatDocs();
    // format — дискриминатор союза: в таблицы контентных полей не входит,
    // описывается во вводной части документа.
    const stale = Object.keys(FIELD_DESCRIPTIONS)
      .filter((path) => path !== 'format' && !fresh.includes(`| \`${path}\` |`));
    expect(stale, 'описания без поля в схеме').toEqual([]);
  });
});
