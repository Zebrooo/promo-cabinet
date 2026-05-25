import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@/env';

let client: S3Client | null = null;

/**
 * Lazily-constructed singleton S3 client. Targets the configured S3-compatible
 * endpoint (bucket.ru) with path-style addressing; creds come via the standard AWS
 * SDK chain (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env).
 */
export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.awsRegion,
      ...(env.s3Endpoint ? { endpoint: env.s3Endpoint } : {}),
      forcePathStyle: env.s3ForcePathStyle,
    });
  }
  return client;
}

/** Catalogue object key, honouring the optional key prefix. */
export function catalogueKey(): string {
  return `${env.promoKeyPrefix}catalogue.json`;
}

/** Test seam: drop the memoized client. */
export function resetS3ClientForTests(): void {
  client = null;
}

/** True when an S3 error means "the object does not exist yet". */
export function isNoSuchKey(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}
