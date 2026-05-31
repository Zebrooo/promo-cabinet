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
  /** Base URL of the promo-bff (no trailing slash). Used by /api/enhance to
   *  proxy AI enhancement requests. Empty disables the feature server-side. */
  get promoBffUrl() { return (process.env.PROMO_BFF_URL ?? '').replace(/\/$/, ''); },
  /** Bearer used for the cabinet→BFF auth header. In dev, any non-empty value
   *  satisfies the BFF's stub authenticator; in prod, this will be replaced by
   *  a service-ticket header (see lib/ai-bff.ts TODO). */
  get promoBffAuthBearer() { return process.env.PROMO_BFF_AUTH_BEARER ?? ''; },
};
