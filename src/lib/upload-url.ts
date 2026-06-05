/**
 * Public URL для загруженной в S3 promo-картинки. Раньше cabinet возвращал
 * relative path (`/api/img/promo-uploads/...`) — это работало внутри самого
 * кабинета, но ломалось на abkhaz-auto и любом другом потребителе очереди:
 * URL резолвился относительно их домена и отдавал 404 (там нет такого
 * прокси). Поэтому fullscreen-промо с `backgroundImage` показывал белый
 * фон + белый текст = "только кнопки".
 *
 * Новая логика — всегда абсолютный URL:
 *   1. `PROMO_PUBLIC_BASE` — если есть (CDN/CloudFront/прямой bucket-host)
 *   2. `PROMO_CABINET_PUBLIC_BASE` — публичный домен кабинета (https://promo.eremin.site)
 *   3. Request `origin` — если ни одна env-переменная не задана,
 *      выдёргиваем из x-forwarded-host / host. Лучше чем relative.
 *
 * Хранится в очереди `home-popup.json` → JSON в S3 → читается abkhaz-auto.
 */

import { env } from "@/env";
import type { NextRequest } from "next/server";

function stripSlash(s: string): string { return s.endsWith("/") ? s.slice(0, -1) : s; }
function stripPrefix(s: string, prefix: string): string {
  return prefix && s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

/** Раcставляет origin из request (с учётом proxy headers x-forwarded-*). */
function originFromRequest(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

/** Главный helper. key — полный S3 ключ (с префиксом если есть в env). */
export function resolvePublicUploadUrl(key: string, req: NextRequest): string {
  const relKey = stripPrefix(key, env.promoKeyPrefix ?? "");

  // 1. CDN/прямой S3-домен
  if (env.promoPublicBase) {
    return `${stripSlash(env.promoPublicBase)}/${key}`;
  }

  // 2. Cabinet'овский img-proxy за публичным доменом
  const base = env.promoCabinetPublicBase || originFromRequest(req);
  return `${stripSlash(base)}/api/img/${relKey}`;
}
