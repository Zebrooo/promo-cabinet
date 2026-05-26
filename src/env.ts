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
};
