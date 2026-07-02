import type { Promo } from './schema';

/** Human labels per format — the single source for format naming across the
 *  cabinet (PromoForm tiles, PromoList filter chips, QueueEditor badges,
 *  preview notes, analytics legend). `name` — английское капитализированное
 *  имя типа (контракт: Inline, Topline, Popup, Fullscreen, DivKit, Tooltip,
 *  Multistep — сверено с promoFormatSchema); `sub` — русское пояснение.
 *  Живёт в lib (без 'use client'), чтобы импортироваться и клиентскими
 *  компонентами, и server components без цикла PromoForm ↔ PromoPreview. */
export const FORMAT_LABEL: Record<Promo['format'], { name: string; sub: string }> = {
  inline:     { name: 'Inline',     sub: 'В ленте' },
  topline:    { name: 'Topline',    sub: 'Над шапкой' },
  popup:      { name: 'Popup',      sub: 'Поверх' },
  fullscreen: { name: 'Fullscreen', sub: 'На весь экран' },
  divkit:     { name: 'DivKit',     sub: 'JSON-верстка' },
  tooltip:    { name: 'Tooltip',    sub: 'Подсказка у элемента' },
  multistep:  { name: 'Multistep',  sub: 'Пошаговый визард' },
  custom:     { name: 'Custom',     sub: 'Host-компонент' },
};

/** English capitalized format name shown to humans. Falls back to the raw id
 *  for anything the map doesn't know (legacy/unknown formats in analytics). */
export function formatName(format: string): string {
  return (FORMAT_LABEL as Record<string, { name: string } | undefined>)[format]?.name ?? format;
}
