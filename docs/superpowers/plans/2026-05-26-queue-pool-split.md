# Queue/Pool storage split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split promo storage on S3 into a pool (`promos.json`, all promos) + an ordered queue (`queue.json`, active promo ids). The cabinet can enqueue/dequeue (reversible) and hard-delete; abhPromo serves only queued promos in queue order.

**Architecture:** Two S3 JSON objects per the spec (`docs/superpowers/specs/2026-05-26-queue-pool-split-design.md`). abhPromo reads both and joins (skipping dangling ids). The cabinet's storage lib manages the two objects; mutations split into pool ops (`Promo[]`) and queue ops (`string[]`); new/changed API routes; list/queue pages and components gain enqueue/dequeue/hard-delete. Creation adds to the pool only.

**Tech Stack:** TypeScript, zod, Vitest 3 (real bucket.ru S3 via gitignored `.env`, unique key prefix per test), Next.js 14, @aws-sdk/client-s3.

**Build order:** Phase A (abhPromo) is independent. Phases B→C→D (cabinet) are sequential. Run each repo's commands from its own root.

---

## Phase A — abhPromo (`c:\Users\Yarrrr\Desktop\abhPromo`, branch `feat/s3-queue-cooldown`)

### Task A1: Add `queueSchema` (TDD)

**Files:**
- Modify: `src/services/catalogue-schema.ts`
- Test: `src/services/catalogue-schema.test.ts`

- [ ] **Step 1: Write the failing test** — add inside the existing `describe('promoSchema', ...)` (or a new `describe('queueSchema', ...)`) in `src/services/catalogue-schema.test.ts`:
```ts
  it('queueSchema accepts an array of id strings', () => {
    expect(() => queueSchema.parse(['a', 'b'])).not.toThrow();
    expect(() => queueSchema.parse([1, 2])).toThrow();
  });
```
Add `queueSchema` to the existing import from `./catalogue-schema`.

- [ ] **Step 2: Run** `npx vitest run src/services/catalogue-schema.test.ts` → FAIL (`queueSchema` undefined).

- [ ] **Step 3: Add the schema** — in `src/services/catalogue-schema.ts`, after the `catalogueSchema` line add:
```ts
/** The pool is an array of promos. */
export const poolSchema = catalogueSchema;
/** The queue is an ordered array of promo ids. */
export const queueSchema = z.array(z.string().min(1));
```

- [ ] **Step 4: Run** `npx vitest run src/services/catalogue-schema.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/catalogue-schema.ts src/services/catalogue-schema.test.ts
git commit -m "feat: add queueSchema/poolSchema for queue-pool model"
```

---

### Task A2: S3 keys — `promosKey()`/`queueKey()` + `isNoSuchKey`

**Files:**
- Modify: `src/services/s3-client.ts`

- [ ] **Step 1: Replace `catalogueKey` and add `isNoSuchKey`** — in `src/services/s3-client.ts`, replace:
```ts
/** Catalogue object key, honouring the optional key prefix. */
export function catalogueKey(): string {
  return `${config.s3.keyPrefix}catalogue.json`;
}
```
with:
```ts
/** Pool object key (all promos), honouring the optional key prefix. */
export function promosKey(): string {
  return `${config.s3.keyPrefix}promos.json`;
}

/** Queue object key (ordered active promo ids), honouring the optional key prefix. */
export function queueKey(): string {
  return `${config.s3.keyPrefix}queue.json`;
}

/** True when an S3 error means "the object does not exist yet". */
export function isNoSuchKey(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}
```

- [ ] **Step 2:** Don't commit yet — `config-service.ts` and tests still reference `catalogueKey`; they're fixed next (compile would fail). Proceed to A3.

---

### Task A3: config-service reads pool+queue and joins (TDD)

**Files:**
- Modify: `src/services/config-service.ts`
- Modify: `src/services/config-service.test.ts`

- [ ] **Step 1: Rewrite the test** — replace `src/services/config-service.test.ts` entirely:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createConfigService } from './config-service';
import { promosKey, queueKey, getS3Client, resetS3ClientForTests } from './s3-client';
import { config } from '../config';
import { makePromo } from '../test-utils';

const put = (key: string, text: string) =>
  getS3Client().send(
    new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: text, ContentType: 'application/json' }),
  );
const putPool = (promos: unknown) => put(promosKey(), JSON.stringify(promos));
const putQueue = (ids: unknown) => put(queueKey(), JSON.stringify(ids));

beforeEach(() => {
  config.s3.keyPrefix = `test/abhpromo-config/${randomUUID()}/`;
  resetS3ClientForTests();
});

afterEach(async () => {
  const c = getS3Client();
  await c.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: promosKey() })).catch(() => {});
  await c.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: queueKey() })).catch(() => {});
  config.s3.keyPrefix = '';
});

describe('configService.getPromos', () => {
  it('returns queued promos in queue order', async () => {
    await putPool([makePromo({ id: 'a' }), makePromo({ id: 'b' }), makePromo({ id: 'c' })]);
    await putQueue(['c', 'a']);
    const result = await createConfigService().getPromos();
    expect(result.map((p) => p.id)).toEqual(['c', 'a']);
  });

  it('excludes pool promos that are not in the queue', async () => {
    await putPool([makePromo({ id: 'a' }), makePromo({ id: 'b' })]);
    await putQueue(['a']);
    const result = await createConfigService().getPromos();
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('skips queue ids that have no matching pool promo (dangling)', async () => {
    await putPool([makePromo({ id: 'a' })]);
    await putQueue(['ghost', 'a']);
    const result = await createConfigService().getPromos();
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('returns an empty list when the objects do not exist', async () => {
    const result = await createConfigService().getPromos();
    expect(result).toEqual([]);
  });

  it('throws on malformed pool JSON', async () => {
    await putPool('{not json' as unknown);
    await putQueue(['a']);
    await expect(createConfigService().getPromos()).rejects.toThrow();
  });
});
```
Note: `putPool('{not json')` writes the literal string `"{not json"` (a JSON string), so the pool parse still fails on the inner content — keep this test; if `JSON.parse` of the outer string yields a string, `poolSchema.parse` rejects it (not an array), which still throws. Acceptable.

- [ ] **Step 2: Run** `npx vitest run src/services/config-service.test.ts` → FAIL (config-service still reads `catalogueKey`).

- [ ] **Step 3: Rewrite `src/services/config-service.ts`**:
```ts
/**
 * Config service — reads the promo pool + queue from S3 and joins them into the
 * ordered list of active promos (queue order; first match wins downstream).
 *
 * Fresh GET per request (no cache). Missing objects read as empty. The JSON is
 * defensively zod-validated, so corrupt data throws (→ handled as an "error" envelope).
 */
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { Promo } from '../promo-selector/types';
import { config } from '../config';
import { withTimeout } from '../util/with-timeout';
import { promosKey, queueKey, getS3Client, isNoSuchKey } from './s3-client';
import { poolSchema, queueSchema } from './catalogue-schema';

async function readObject(key: string): Promise<string | null> {
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
    if (!res.Body) return null;
    return await res.Body.transformToString();
  } catch (err) {
    if (isNoSuchKey(err)) return null;
    throw err;
  }
}

async function fetchPromos(): Promise<Promo[]> {
  const [poolText, queueText] = await Promise.all([readObject(promosKey()), readObject(queueKey())]);
  const pool = poolText === null ? [] : poolSchema.parse(JSON.parse(poolText));
  const ids = queueText === null ? [] : queueSchema.parse(JSON.parse(queueText));
  const byId = new Map(pool.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Promo => p !== undefined);
}

export interface ConfigService {
  /** Queued promos, in queue order (first match wins downstream). */
  getPromos(): Promise<Promo[]>;
}

export function createConfigService(): ConfigService {
  const ms = config.serviceTimeouts.configServiceMs;
  return {
    getPromos: () => withTimeout(fetchPromos(), ms, 'configService.getPromos'),
  };
}
```

- [ ] **Step 4: Run** `npx vitest run src/services/config-service.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/s3-client.ts src/services/config-service.ts src/services/config-service.test.ts
git commit -m "feat: abhPromo reads pool+queue and joins into ordered active promos"
```

---

### Task A4: seed script writes both objects

**Files:**
- Modify: `scripts/seed-catalogue.ts`

- [ ] **Step 1: Update `main()`** — in `scripts/seed-catalogue.ts`, change the imports `import { catalogueKey, getS3Client } from '../src/services/s3-client';` to `import { promosKey, queueKey, getS3Client } from '../src/services/s3-client';`, and replace the body of `main()` (the PUT + console.log) with:
```ts
async function main(): Promise<void> {
  if (!config.s3.bucket) throw new Error('PROMO_BUCKET is not set');
  const promos = catalogueSchema.parse(seed); // fail fast if the seed is malformed
  const client = getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: config.s3.bucket, Key: promosKey(),
    Body: JSON.stringify(promos, null, 2), ContentType: 'application/json',
  }));
  await client.send(new PutObjectCommand({
    Bucket: config.s3.bucket, Key: queueKey(),
    Body: JSON.stringify(promos.map((p) => p.id), null, 2), ContentType: 'application/json',
  }));
  console.log(`Seeded ${promos.length} promos to s3://${config.s3.bucket}/${promosKey()} and queue ${queueKey()}`);
}
```

- [ ] **Step 2: Typecheck** `npm run typecheck` → 0 errors (confirms no remaining `catalogueKey` references).

- [ ] **Step 3: Commit**
```bash
git add scripts/seed-catalogue.ts
git commit -m "chore: seed writes promos.json + queue.json"
```

---

### Task A5: Full suite + typecheck

- [ ] **Step 1:** `npm test` → all green (note: hits the real bucket; if a failure is purely network/credentials, report it but it is not a code defect).
- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** No commit (verification only).

---

## Phase B — cabinet storage lib (`c:\Users\Yarrrr\Desktop\promo-cabinet`, branch `feat/cabinet-implementation`)

### Task B1: Add `queueSchema`/`poolSchema` (TDD)

**Files:**
- Modify: `src/lib/schema.ts`
- Test: `src/lib/schema.test.ts`

- [ ] **Step 1: Failing test** — in `src/lib/schema.test.ts`, add a `describe('queueSchema', ...)`:
```ts
describe('queueSchema', () => {
  it('accepts an array of id strings and rejects non-strings', () => {
    expect(() => queueSchema.parse(['a', 'b'])).not.toThrow();
    expect(() => queueSchema.parse(['a', 2])).toThrow();
  });
});
```
Add `queueSchema` to the import from `@/lib/schema` (or `./schema`) at the top of the test.

- [ ] **Step 2: Run** `npx vitest run src/lib/schema.test.ts` → FAIL.

- [ ] **Step 3: Add schemas** — in `src/lib/schema.ts`, after `export const catalogueSchema = z.array(promoSchema);` add:
```ts
/** The pool is an array of promos. */
export const poolSchema = catalogueSchema;
/** The queue is an ordered array of promo ids. */
export const queueSchema = z.array(z.string().min(1));
export type Queue = z.infer<typeof queueSchema>;
```

- [ ] **Step 4: Run** `npx vitest run src/lib/schema.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/schema.ts src/lib/schema.test.ts
git commit -m "feat: add queueSchema/poolSchema to cabinet schema"
```

---

### Task B2: S3 keys — `promosKey()`/`queueKey()`

**Files:**
- Modify: `src/lib/s3.ts`

- [ ] **Step 1:** In `src/lib/s3.ts`, replace:
```ts
/** Catalogue object key, honouring the optional key prefix. */
export function catalogueKey(): string {
  return `${env.promoKeyPrefix}catalogue.json`;
}
```
with:
```ts
/** Pool object key (all promos), honouring the optional key prefix. */
export function promosKey(): string {
  return `${env.promoKeyPrefix}promos.json`;
}

/** Queue object key (ordered active promo ids), honouring the optional key prefix. */
export function queueKey(): string {
  return `${env.promoKeyPrefix}queue.json`;
}
```
(Leave `isNoSuchKey` and `resetS3ClientForTests` as they are.)

- [ ] **Step 2:** No commit yet — `catalogue.ts` + tests still reference `catalogueKey`; fixed in B3 (compile would fail until then).

---

### Task B3: Two-object store (TDD)

**Files:**
- Modify: `src/lib/catalogue.ts` (replace entirely)
- Modify: `src/lib/catalogue.test.ts` (replace entirely)

- [ ] **Step 1: Replace `src/lib/catalogue.test.ts`** entirely:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readPool, writePool, readQueue, writeQueue, mutatePool, mutateQueue, readState } from './catalogue';
import { addPromo, enqueue } from './mutations';
import { promosKey, queueKey, getS3Client, resetS3ClientForTests } from './s3';
import { env } from '@/env';
import type { Promo } from './schema';

const make = (id: string): Promo => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: id,
});

const put = (key: string, text: string) =>
  getS3Client().send(new PutObjectCommand({ Bucket: env.promoBucket, Key: key, Body: text, ContentType: 'application/json' }));

beforeEach(() => {
  process.env.PROMO_KEY_PREFIX = `test/store/${randomUUID()}/`;
  resetS3ClientForTests();
});

afterEach(async () => {
  const c = getS3Client();
  await c.send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: promosKey() })).catch(() => {});
  await c.send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey() })).catch(() => {});
});

describe('pool', () => {
  it('reads written promos', async () => {
    await writePool([make('a'), make('b')]);
    expect((await readPool()).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('reads empty when the object is missing', async () => {
    expect(await readPool()).toEqual([]);
  });
  it('mutatePool applies and persists', async () => {
    await writePool([make('a')]);
    const next = await mutatePool((promos) => addPromo(promos, make('b')));
    expect(next.map((p) => p.id)).toEqual(['a', 'b']);
    expect((await readPool()).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('queue', () => {
  it('reads written ids', async () => {
    await writeQueue(['a', 'b']);
    expect(await readQueue()).toEqual(['a', 'b']);
  });
  it('reads empty when the object is missing', async () => {
    expect(await readQueue()).toEqual([]);
  });
  it('mutateQueue applies and persists', async () => {
    await writeQueue(['a']);
    const next = await mutateQueue((ids) => enqueue(ids, 'b'));
    expect(next).toEqual(['a', 'b']);
    expect(await readQueue()).toEqual(['a', 'b']);
  });
});

describe('readState', () => {
  it('returns both pool and queue', async () => {
    await writePool([make('a')]);
    await writeQueue(['a']);
    expect(await readState()).toEqual({ promos: [make('a')], queue: ['a'] });
  });
  it('returns empty pool and queue when nothing is written', async () => {
    expect(await readState()).toEqual({ promos: [], queue: [] });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/catalogue.test.ts` → FAIL (old `catalogue.ts` exports `readCatalogue`, not these).

- [ ] **Step 3: Replace `src/lib/catalogue.ts`** entirely:
```ts
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { promosKey, queueKey, getS3Client, isNoSuchKey } from './s3';
import { poolSchema, queueSchema, type Promo } from './schema';

/** A missing object reads as null. */
async function readText(key: string): Promise<string | null> {
  try {
    const res = await getS3Client().send(new GetObjectCommand({ Bucket: env.promoBucket, Key: key }));
    return await res.Body!.transformToString();
  } catch (err) {
    if (isNoSuchKey(err)) return null;
    throw err;
  }
}

/** Plain (unconditional) PUT — the bucket.ru backend has no conditional writes (last-write-wins). */
async function writeJson(key: string, value: unknown): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({ Bucket: env.promoBucket, Key: key, Body: JSON.stringify(value, null, 2), ContentType: 'application/json' }),
  );
}

export async function readPool(): Promise<Promo[]> {
  const text = await readText(promosKey());
  return text === null ? [] : poolSchema.parse(JSON.parse(text));
}
export async function writePool(promos: Promo[]): Promise<void> {
  await writeJson(promosKey(), promos);
}

export async function readQueue(): Promise<string[]> {
  const text = await readText(queueKey());
  return text === null ? [] : queueSchema.parse(JSON.parse(text));
}
export async function writeQueue(ids: string[]): Promise<void> {
  await writeJson(queueKey(), ids);
}

/** Read-modify-write the pool (last-write-wins). A domain error in `apply` propagates before any write. */
export async function mutatePool(apply: (promos: Promo[]) => Promo[]): Promise<Promo[]> {
  const next = apply(await readPool());
  await writePool(next);
  return next;
}

/** Read-modify-write the queue (last-write-wins). */
export async function mutateQueue(apply: (ids: string[]) => string[]): Promise<string[]> {
  const next = apply(await readQueue());
  await writeQueue(next);
  return next;
}

/** Both objects, for rendering pages. */
export async function readState(): Promise<{ promos: Promo[]; queue: string[] }> {
  const [promos, queue] = await Promise.all([readPool(), readQueue()]);
  return { promos, queue };
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/catalogue.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/s3.ts src/lib/catalogue.ts src/lib/catalogue.test.ts
git commit -m "feat: two-object store (pool + queue) replacing single catalogue"
```

---

### Task B4: Queue mutations (TDD)

**Files:**
- Modify: `src/lib/mutations.ts`
- Modify: `src/lib/mutations.test.ts`

- [ ] **Step 1: Add failing tests** — in `src/lib/mutations.test.ts`, add:
```ts
describe('queue ops', () => {
  it('enqueue appends when absent and is idempotent', () => {
    expect(enqueue(['a'], 'b')).toEqual(['a', 'b']);
    expect(enqueue(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });
  it('dequeue removes the id and is idempotent', () => {
    expect(dequeue(['a', 'b'], 'a')).toEqual(['b']);
    expect(dequeue(['b'], 'a')).toEqual(['b']);
  });
  it('reorderQueue accepts a permutation', () => {
    expect(reorderQueue(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });
  it('reorderQueue rejects a non-permutation', () => {
    expect(() => reorderQueue(['a', 'b'], ['a'])).toThrow(ReorderMismatchError);
    expect(() => reorderQueue(['a', 'b'], ['a', 'x'])).toThrow(ReorderMismatchError);
  });
});
```
Add `enqueue, dequeue, reorderQueue` (and ensure `ReorderMismatchError`) to the import from `./mutations`. If `mutations.test.ts` has tests for the old `reorderPromos`, remove those (it's being replaced).

- [ ] **Step 2: Run** `npx vitest run src/lib/mutations.test.ts` → FAIL.

- [ ] **Step 3: Edit `src/lib/mutations.ts`** — update the `addPromo` doc comment from "queue" to "pool", **remove** the `reorderPromos` function, and add the queue ops:
```ts
/** Append a promo to the pool. Rejects a duplicate id. */
export function addPromo(promos: Promo[], promo: Promo): Promo[] {
  if (promos.some((p) => p.id === promo.id)) {
    throw new DuplicateIdError(`promo "${promo.id}" already exists`);
  }
  return [...promos, promo];
}
```
(Keep `updatePromo` and `removePromo` unchanged.) Then add at the end of the file:
```ts
/** Append id to the queue if not already present (idempotent). */
export function enqueue(queue: string[], id: string): string[] {
  return queue.includes(id) ? queue : [...queue, id];
}

/** Remove id from the queue (idempotent). */
export function dequeue(queue: string[], id: string): string[] {
  return queue.filter((q) => q !== id);
}

/** Reorder the queue to match `ids`, which must be a permutation of the current ids. */
export function reorderQueue(queue: string[], ids: string[]): string[] {
  const sameLength = ids.length === queue.length;
  const sameSet = new Set(ids).size === ids.length && ids.every((id) => queue.includes(id));
  if (!sameLength || !sameSet) {
    throw new ReorderMismatchError('ids must be a permutation of the current queue ids');
  }
  return [...ids];
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/mutations.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/mutations.ts src/lib/mutations.test.ts
git commit -m "feat: queue mutations (enqueue/dequeue/reorderQueue); addPromo is pool-only"
```

---

## Phase C — cabinet API routes

### Task C1: `GET`/`POST /api/promos`

**Files:**
- Modify: `src/app/api/promos/route.ts`

- [ ] **Step 1: Replace** `src/app/api/promos/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutatePool, readState } from '@/lib/catalogue';
import { addPromo, DuplicateIdError } from '@/lib/mutations';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { promos, queue } = await readState();
    return NextResponse.json({ promos, queue });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let promo;
  try {
    promo = promoSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_promo' }, { status: 400 });
  }

  try {
    await mutatePool((promos) => addPromo(promos, promo));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateIdError) return NextResponse.json({ error: 'duplicate_id' }, { status: 409 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify** `npm run typecheck` → 0 errors (route tests run in C-end). Commit:
```bash
git add src/app/api/promos/route.ts
git commit -m "feat: GET /api/promos returns {promos, queue}; POST adds to pool"
```

---

### Task C2: `PUT`/`DELETE /api/promos/[id]`

**Files:**
- Modify: `src/app/api/promos/[id]/route.ts`

- [ ] **Step 1: Replace** `src/app/api/promos/[id]/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutatePool, mutateQueue } from '@/lib/catalogue';
import { removePromo, updatePromo, dequeue, NotFoundError } from '@/lib/mutations';

export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let promo;
  try {
    promo = promoSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_promo' }, { status: 400 });
  }
  if (promo.id !== params.id) {
    return NextResponse.json({ error: 'id_mismatch' }, { status: 400 });
  }

  try {
    await mutatePool((promos) => updatePromo(promos, params.id, promo));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

/** Hard delete: remove from the queue first, then the pool. */
export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    await mutateQueue((ids) => dequeue(ids, params.id));
    await mutatePool((promos) => removePromo(promos, params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add "src/app/api/promos/[id]/route.ts"
git commit -m "feat: DELETE /api/promos/[id] hard-deletes from queue then pool"
```

---

### Task C3: `POST`/`DELETE /api/promos/[id]/queue` (enqueue/dequeue)

**Files:**
- Create: `src/app/api/promos/[id]/queue/route.ts`

- [ ] **Step 1: Create** `src/app/api/promos/[id]/queue/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { mutateQueue, readPool } from '@/lib/catalogue';
import { enqueue, dequeue } from '@/lib/mutations';

export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

/** Add the promo to the end of the queue (must exist in the pool). */
export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const pool = await readPool();
    if (!pool.some((p) => p.id === params.id)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await mutateQueue((ids) => enqueue(ids, params.id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

/** Remove the promo from the queue (it stays in the pool). */
export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await mutateQueue((ids) => dequeue(ids, params.id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add "src/app/api/promos/[id]/queue/route.ts"
git commit -m "feat: POST/DELETE /api/promos/[id]/queue (enqueue/dequeue)"
```

---

### Task C4: `PUT /api/queue` (reorder) + remove old reorder route

**Files:**
- Create: `src/app/api/queue/route.ts`
- Delete: `src/app/api/promos/reorder/route.ts`

- [ ] **Step 1: Create** `src/app/api/queue/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { mutateQueue } from '@/lib/catalogue';
import { reorderQueue, ReorderMismatchError } from '@/lib/mutations';

export const runtime = 'nodejs';

const bodySchema = z.object({ ids: z.array(z.string().min(1)) });

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let ids: string[];
  try {
    ids = bodySchema.parse(await req.json()).ids;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    await mutateQueue((current) => reorderQueue(current, ids));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReorderMismatchError) return NextResponse.json({ error: 'reorder_mismatch' }, { status: 400 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Delete the old route**
```bash
git rm src/app/api/promos/reorder/route.ts
```

- [ ] **Step 3: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/queue/route.ts
git commit -m "feat: PUT /api/queue reorders the queue (replaces /api/promos/reorder)"
```

---

### Task C5: Route integration tests (real S3)

**Files:**
- Modify/replace: the existing API route test(s). Find them first: `git ls-files "src/app/api/**/*.test.ts"` and read the existing route test to copy its harness (auth cookie + unique `PROMO_KEY_PREFIX` per test + cleanup of both objects). If no route test exists, create `src/app/api/promos/route.test.ts`.

- [ ] **Step 1: Write tests** covering the new behavior (adapt the harness from the existing route test / `src/lib/catalogue.test.ts`; build an authed `NextRequest` the same way the current tests do). Cover:
  - `POST /api/promos` adds to the pool but NOT the queue (`readPool` has it, `readQueue` empty).
  - `GET /api/promos` returns `{ promos, queue }`.
  - `POST /api/promos/[id]/queue` enqueues; `DELETE` dequeues; the pool is unchanged by both.
  - `POST /api/promos/[id]/queue` on an unknown id → 404.
  - `DELETE /api/promos/[id]` removes from both pool and queue.
  - `PUT /api/queue` reorders; a non-permutation → 400 `reorder_mismatch`.

  Use the route handlers by importing them directly (as the existing route tests do) and asserting via `readPool()`/`readQueue()` from `@/lib/catalogue`. Each test sets a unique `process.env.PROMO_KEY_PREFIX`, calls `resetS3ClientForTests()`, and cleans up `promosKey()` + `queueKey()` in `afterEach`.

- [ ] **Step 2: Run** `npx vitest run src/app/api` → PASS.

- [ ] **Step 3: Commit**
```bash
git add src/app/api
git commit -m "test: route integration tests for pool/queue endpoints"
```

---

## Phase D — cabinet UI

### Task D1: List page + `PromoList` (badge, enqueue, hard-delete)

**Files:**
- Modify: `src/app/cabinet/page.tsx`
- Modify: `src/components/PromoList.tsx`

- [ ] **Step 1: Replace `src/app/cabinet/page.tsx`**:
```tsx
import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { readState } from '@/lib/catalogue';
import { PromoList } from '@/components/PromoList';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  let promos; let queue;
  try {
    ({ promos, queue } = await readState());
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Все промо</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }
  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Каталог</p>
          <h1>Все промо <span className="count-badge">{promos.length}</span></h1>
        </div>
        <Link className="btn btn--primary" href="/cabinet/new">+ Новое промо</Link>
      </div>
      {promos.length === 0
        ? <div className="empty">Промо пока нет. Создайте первое — оно появится здесь; добавьте его в очередь, чтобы показывать.</div>
        : <PromoList promos={promos} queuedIds={queue} />}
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/components/PromoList.tsx`**:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoList({ promos, queuedIds }: { promos: Promo[]; queuedIds: string[] }) {
  const router = useRouter();
  const [queued, setQueued] = useState<Set<string>>(new Set(queuedIds));
  const [list, setList] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);

  async function enqueue(id: string) {
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}/queue`, { method: 'POST' });
    setQueued((cur) => new Set(cur).add(id));
    setBusy(false);
    router.refresh();
  }

  async function removeForever(id: string) {
    if (!confirm(`Удалить промо "${id}" совсем? Это уберёт его из очереди и из хранилища.`)) return;
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setList((cur) => cur.filter((p) => p.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="cards">
      {list.map((p) => {
        const inQueue = queued.has(p.id);
        return (
          <article className="card" key={p.id}>
            <div className="card__top">
              <span className={`pill ${inQueue ? 'pill--on' : 'pill--off'}`}>
                {inQueue ? 'в очереди' : 'в пуле'}
              </span>
              <span className="tag">{p.format}</span>
            </div>
            <h3 className="card__title">{p.title}</h3>
            <p className="card__id">{p.id}</p>
            <dl className="card__meta">
              <div><dt>Активен сейчас</dt><dd>{isActive(p) ? 'да' : 'нет'}</dd></div>
              <div><dt>Лимит</dt><dd>{p.maxImpressionsPerUser || '∞'}</dd></div>
            </dl>
            <div className="card__actions">
              <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
              {!inQueue && <button disabled={busy} onClick={() => enqueue(p.id)}>В очередь</button>}
              <button className="btn--danger" disabled={busy} onClick={() => removeForever(p.id)}>Удалить совсем</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify** `npm run typecheck` → 0 errors. Commit:
```bash
git add src/app/cabinet/page.tsx src/components/PromoList.tsx
git commit -m "feat: list page shows pool with in-queue badge, enqueue + hard-delete"
```

---

### Task D2: Queue page + `PromoQueue` (resolve queued, reorder via /api/queue, dequeue)

**Files:**
- Modify: `src/app/cabinet/queue/page.tsx`
- Modify: `src/components/PromoQueue.tsx`

- [ ] **Step 1: Replace `src/app/cabinet/queue/page.tsx`**:
```tsx
import { requireSession } from '@/lib/require-session';
import { readState } from '@/lib/catalogue';
import { PromoQueue } from '@/components/PromoQueue';
import type { Promo } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  requireSession();
  let promos; let queue;
  try {
    ({ promos, queue } = await readState());
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Очередь показа</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }
  // Resolve queue ids to promos, in order, skipping dangling ids.
  const byId = new Map(promos.map((p) => [p.id, p]));
  const ordered = queue.map((id) => byId.get(id)).filter((p): p is Promo => p !== undefined);

  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Порядок показа</p>
          <h1>Очередь показа <span className="count-badge">{ordered.length}</span></h1>
          <p className="subnote">№1 проверяется первым; пользователю показывается первое подходящее промо.</p>
        </div>
      </div>
      {ordered.length === 0
        ? <div className="empty">Очередь пуста — добавьте промо из раздела «Все промо».</div>
        : <PromoQueue promos={ordered} />}
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/components/PromoQueue.tsx`**:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoQueue({ promos }: { promos: Promo[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<Promo[]>(promos);
  const [busy, setBusy] = useState(false);

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setBusy(true);
    await fetch('/api/queue', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    });
    setBusy(false);
    router.refresh();
  }

  async function dequeue(id: string) {
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}/queue`, { method: 'DELETE' });
    setOrder((cur) => cur.filter((p) => p.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
    <ol className="queue">
      {order.map((p, i) => (
        <li className="qrow" key={p.id}>
          <span className="qrow__pos">{i + 1}</span>
          <div className="qrow__main">
            <span className="qrow__title">{p.title}</span>
            <span className="qrow__id">{p.id}</span>
          </div>
          <span className={`pill ${isActive(p) ? 'pill--on' : 'pill--off'}`}>
            {isActive(p) ? 'активен' : 'не активен'}
          </span>
          <span className="tag">{p.format}</span>
          <div className="qrow__move">
            <button className="iconbtn" aria-label="Выше" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="iconbtn" aria-label="Ниже" disabled={busy || i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="iconbtn" aria-label="Убрать из очереди" disabled={busy} onClick={() => dequeue(p.id)}>✕</button>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: Verify** `npm run typecheck` → 0 errors. Commit:
```bash
git add src/app/cabinet/queue/page.tsx src/components/PromoQueue.tsx
git commit -m "feat: queue page resolves queued promos, reorders via /api/queue, dequeue"
```

---

### Task D3: Full verification

- [ ] **Step 1:** `npm test` → all green (unit + real-S3 store/route suites). Network-only failures are not code defects — report them.
- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** `npm run build` → succeeds (no stale `catalogue`/`reorder` imports; all pages compile).
- [ ] **Step 4: Manual smoke (optional):** `npm run dev`, log in. Create a promo → it appears in «Все промо» with badge «в пуле», queue is empty. Click «В очередь» → badge flips, it shows on «Очередь». Reorder with ↑↓. «Убрать из очереди» → leaves the queue, stays in «Все промо». «Удалить совсем» (confirm) → gone from both.

---

## Done

Storage is split into `promos.json` (pool) + `queue.json` (ordered ids). The cabinet creates into the pool, enqueues/dequeues reversibly, reorders the queue, and hard-deletes from both; abhPromo serves only queued promos in queue order, skipping dangling ids.
