/**
 * Тест-хелпер против «тихого среза»: zod-объекты кабинета нестрогие и молча
 * выкидывают ключи, которых нет в схеме члена формата. «Схема приняла» при
 * этом НЕ значит «поле доедет до пула и рендерера» — так уже терялись
 * bullets/popupVariant (popup), descriptionColor (popup), dismissible и
 * description (multistep), imageUrl (topline). Хелпер сравнивает ключи входа
 * с ключами результата safeParse и возвращает пути, которые пропали.
 * Живёт в src/lib, а не в тесте, чтобы им же можно было проверить фикстуру
 * из скрипта или REPL.
 */
import type { z } from 'zod';

/** Пути (dot-нотация, массивы — по индексу), которые есть во входе, но
 *  отсутствуют в результате парсинга. Пустой массив = ничего не срезано.
 *  Ключи со значением undefined во входе не считаются: их нет и в JSON. */
export function strippedPaths(input: unknown, output: unknown, prefix = ''): string[] {
  if (Array.isArray(input)) {
    if (!Array.isArray(output)) return [prefix];
    return input.flatMap((item, i) => strippedPaths(item, output[i], `${prefix}.${i}`));
  }
  if (input && typeof input === 'object') {
    if (!output || typeof output !== 'object' || Array.isArray(output)) return [prefix];
    const out = output as Record<string, unknown>;
    return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
      if (value === undefined) return [];
      const path = prefix ? `${prefix}.${key}` : key;
      if (!(key in out)) return [path];
      return strippedPaths(value, out[key], path);
    });
  }
  return [];
}

/** Парсит вход схемой и возвращает срезанные пути. Невалидный вход —
 *  исключение с issues: фикстура должна быть валидной, иначе проверка среза
 *  бессмысленна. */
export function strippedBySchema(schema: z.ZodTypeAny, input: unknown): string[] {
  const res = schema.safeParse(input);
  if (!res.success) {
    throw new Error(`фикстура невалидна: ${res.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`);
  }
  return strippedPaths(input, res.data);
}
