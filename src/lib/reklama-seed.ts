/**
 * Чистая логика засева кампании «promo-reklama-2026-09» (scripts/seed-reklama-2026-09.ts):
 * подстановка реальных URL креативов вместо заглушки, раскладка по очередям в
 * заданном порядке, гейт для s2 (пока витрина не шлёт события мастера).
 * Без S3 и файловой системы — чтобы тестировалось без моков.
 */

/** Заглушка из promos/*.json архива, вместо которой подставляется реальный base. */
export const CREATIVE_PLACEHOLDER = 'https://CDN/promo/reklama-2026-09';

/** Раскладка по очередям. Порядок внутри home важен: s1b → s1 → s2 → s3,
 *  иначе общее «кампания на паузе» (s1) перехватит того, кому нужно сообщение
 *  про исчерпанный лимит (s1b). s2 — только с ENABLE_S2 (см. isGated). */
export const SEED_QUEUES: readonly { queue: string; ids: readonly string[] }[] = [
  { queue: 'home', ids: ['s1b-budget-exhausted', 's1-popup-resume', 's2-popup-abandoned', 's3-multistep-home'] },
  { queue: 'tooltip', ids: ['s3-tooltip-cabinet', 's1c-idle-balance'] },
  { queue: 'persistent-inline', ids: ['s3-inline-catalog'] },
  { queue: 'persistent-topline', ids: ['s1-topline-resume'] },
];

/** Промо, которые нельзя ставить в очередь, пока не сделана задача 1
 *  (витрина не шлёт form_start/form_submit_success с form_id='ad_campaign'):
 *  abandonedWizard никому не совпадёт, показов не будет. */
export const GATED_IDS: ReadonlySet<string> = new Set(['s2-popup-abandoned']);

export const EXPECTED_IDS: readonly string[] = SEED_QUEUES.flatMap((q) => q.ids);

export function isGated(id: string, enableGated: boolean): boolean {
  return !enableGated && GATED_IDS.has(id);
}

export type CreativeKind = 'gif' | 'apng';

/** Имя файла креатива под выбранный формат: `x.gif` → `x-anim.png` для APNG
 *  (24 бита, расширение .png проходит валидацию картинок). */
export function creativeFileName(gifName: string, kind: CreativeKind): string {
  if (kind === 'gif') return gifName;
  return gifName.replace(/\.gif$/i, '-anim.png');
}

/** Все ссылки на заглушку внутри промо (рекурсивно по строкам). */
export function referencedCreatives(value: unknown, placeholder = CREATIVE_PLACEHOLDER): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      const re = new RegExp(`${escapeRegExp(placeholder)}/([^\\s"'()]+)`, 'g');
      for (const m of v.matchAll(re)) out.add(m[1]);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return [...out];
}

/** Подставляет реальный base и (при APNG) имя файла во все строки промо. */
export function rewriteCreativeUrls<T>(
  value: T,
  opts: { base: string; kind: CreativeKind; placeholder?: string },
): T {
  const placeholder = opts.placeholder ?? CREATIVE_PLACEHOLDER;
  const base = opts.base.replace(/\/$/, '');
  const re = new RegExp(`${escapeRegExp(placeholder)}/([^\\s"'()]+)`, 'g');
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return v.replace(re, (_m, file: string) => `${base}/${creativeFileName(file, opts.kind)}`);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

/** Ставит группу ids в очередь одним блоком в заданном порядке: старые
 *  вхождения этих id убираются (повторный запуск идемпотентен), чужие id и их
 *  порядок сохраняются. front = перед всеми, back = после всех. */
export function placeIds(existing: readonly string[], ids: readonly string[], place: 'front' | 'back'): string[] {
  const group = new Set(ids);
  const others = existing.filter((id) => !group.has(id));
  return place === 'front' ? [...ids, ...others] : [...others, ...ids];
}

/** Промо, добавляемые/заменяемые в пуле: новые версии по id, остальное как есть. */
export function upsertById<T extends { id: string }>(pool: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map(incoming.map((p) => [p.id, p]));
  const replaced = pool.map((p) => byId.get(p.id) ?? p);
  const present = new Set(pool.map((p) => p.id));
  return [...replaced, ...incoming.filter((p) => !present.has(p.id))];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
