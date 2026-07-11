import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFormatDocs } from '../src/lib/format-docs';

/**
 * Перегенерирует docs/promo-format-schemas.md из текущих SCHEMA_BY_FORMAT/
 * CONTENT_KEYS_BY_FORMAT (src/lib/schema.ts). Запуск: `npm run docs:formats`.
 * Идемпотентен — повторный запуск без изменений схемы не меняет файл.
 * Логика генерации живёт в src/lib/format-docs.ts, чтобы её же переиспользовал
 * drift-тест (src/lib/format-docs.test.ts).
 */
const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'promo-format-schemas.md');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, generateFormatDocs(), 'utf8');

console.log(`Сгенерировано: ${outPath}`);
