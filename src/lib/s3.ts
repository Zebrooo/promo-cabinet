import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@/env';
import type { EnvMode } from './env-mode';

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

/**
 * Test-mode guardrail.
 *
 * The integration tests connect to the REAL bucket.ru bucket (.env at repo
 * root holds the same credentials prod uses), and they isolate themselves
 * by setting `process.env.PROMO_KEY_PREFIX = "test/<scope>/<uuid>/"` in
 * beforeEach. The afterEach then DELETEs `promosKey()` / `queuesIndexKey()` /
 * `queueKey(...)` — relying on the same prefix being present at delete time.
 *
 * On 2026-05-31 a vitest run wiped production promos.json / queues.json /
 * queue-main.json because some test's beforeEach didn't fire (or the env var
 * was cleared between hooks); afterEach then computed UNPREFIXED keys and
 * deleted the ROOT objects.
 *
 * This guard fails fast instead: under vitest, if the caller asks for a key
 * without a PROMO_KEY_PREFIX, we throw. The test errors loudly; production
 * data is untouched. Production code paths set NODE_ENV=production (or no
 * VITEST env var) and never trigger this check.
 */
const IN_TESTS = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
function guardKey(key: string): string {
  if (IN_TESTS && !env.promoKeyPrefix) {
    throw new Error(
      `[s3] refusing to compute unprefixed key "${key}" while running under vitest — ` +
      `set PROMO_KEY_PREFIX in beforeEach (e.g. "test/<scope>/<uuid>/") so cleanup ` +
      `never targets the production bucket root. This guard exists because a missing ` +
      `prefix during afterEach has wiped real promos.json before.`,
    );
  }
  return key;
}

/**
 * Глобальный режим кабинета (Прод/Тест, см. env-mode.ts) добавляет свой
 * префикс СВЕРХ тестового PROMO_KEY_PREFIX: 'test/' для envMode='test',
 * пусто для 'prod' — так прод-данные остаются на прежних ключах без
 * префикса (обратная совместимость), а тестовый режим живёт в изолированном
 * поддереве того же бакета. Дефолт параметра — 'prod', чтобы существующие
 * вызовы (интеграционные тесты, старый код) не поменяли поведение.
 */
function envPrefix(envMode: EnvMode): string {
  return envMode === 'test' ? 'test/' : '';
}

/** Pool object key (all promos), honouring the optional key prefix. */
export function promosKey(envMode: EnvMode = 'prod'): string {
  return guardKey(`${env.promoKeyPrefix}${envPrefix(envMode)}promos.json`);
}

/** Named-queues index key, honouring the optional key prefix. */
export function queuesIndexKey(envMode: EnvMode = 'prod'): string {
  return guardKey(`${env.promoKeyPrefix}${envPrefix(envMode)}queues.json`);
}

/** Allowed queue-name shape (mirrors the create/rename slug rule). Enforced here
 *  centrally so EVERY handler — not just create/rename — is protected against a
 *  name with `/`, `..` or other characters escaping the key prefix. */
const QUEUE_NAME_RE = /^[a-z0-9-_]+$/i;

/** Per-queue object key for a named queue, honouring the optional key prefix. */
export function queueKey(name: string, envMode: EnvMode = 'prod'): string {
  if (!QUEUE_NAME_RE.test(name)) {
    throw new Error(`[s3] invalid queue name "${name}" — must match ${QUEUE_NAME_RE}`);
  }
  return guardKey(`${env.promoKeyPrefix}${envPrefix(envMode)}queue-${name}.json`);
}

/** Legacy single-queue key — used ONLY for one-time migration. */
export function legacyQueueKey(envMode: EnvMode = 'prod'): string {
  return guardKey(`${env.promoKeyPrefix}${envPrefix(envMode)}queue.json`);
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
