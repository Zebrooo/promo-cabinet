/**
 * Typed, centralized reads of process.env (server-only). Uses lazy getters so each
 * access reflects the current environment — this keeps tests simple (set process.env
 * in beforeEach, no module-reset needed) and avoids stale values.
 */
export const env = {
  get adminUser() { return process.env.ADMIN_USER ?? ''; },
  get adminPassword() { return process.env.ADMIN_PASSWORD ?? ''; },
  get sessionSecret() { return process.env.SESSION_SECRET ?? ''; },
  get awsRegion() { return process.env.AWS_REGION ?? 'ru-1'; },
  get promoBucket() { return process.env.PROMO_BUCKET ?? ''; },
  get promoKeyPrefix() { return process.env.PROMO_KEY_PREFIX ?? ''; },
  /** S3-compatible endpoint (bucket.ru). Empty = default AWS endpoints. */
  get s3Endpoint() { return process.env.PROMO_S3_ENDPOINT ?? ''; },
  /** Path-style addressing — required by bucket.ru and most non-AWS S3 stores. */
  get s3ForcePathStyle() { return process.env.PROMO_S3_FORCE_PATH_STYLE !== 'false'; },
  /** Promo BFF base URL — proxy target for /api/enhance and analytics. */
  get promoBffUrl() { return process.env.PROMO_BFF_URL ?? ''; },
  /** Optional bearer token for BFF /enhance-promo until service-ticket lands here too. */
  get promoBffAuthBearer() { return process.env.PROMO_BFF_AUTH_BEARER ?? ''; },
  /** Прямой публичный base для S3-объектов (CDN/CloudFront/bucket-домен).
   *  Если задан — uploaded-картинки url'ятся в `${PROMO_PUBLIC_BASE}/${key}`
   *  и обходят cabinet-прокси. Для bucket.ru это может быть
   *  `https://config.s3.buckets.ru` (когда bucket public). */
  get promoPublicBase() { return process.env.PROMO_PUBLIC_BASE ?? ''; },
  /** Публичный URL самого кабинета (без trailing /). Используется для
   *  построения absolute URL на загруженные через cabinet картинки —
   *  ВНЕШНИЕ потребители очереди (abkhaz-auto и т.д.) их грузят отсюда. */
  get promoCabinetPublicBase() { return process.env.PROMO_CABINET_PUBLIC_BASE ?? ''; },
};
