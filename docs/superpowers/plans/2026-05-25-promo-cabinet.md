# promo-cabinet (Next.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A password-protected Next.js admin cabinet to author promos as an ordered queue and persist them to S3 as `catalogue.json` (full CRUD + reorder), which abhPromo reads.

**Architecture:** Next.js App Router + TypeScript. All real logic lives in pure, unit-tested `src/lib/` modules: zod `schema`, HMAC cookie `auth`, an `s3` client, pure catalogue `mutations` (add/update/remove/reorder with typed errors), and a `catalogue` read-modify-write layer (ETag `If-Match`, retry → `409`). API route handlers are thin wrappers that authenticate, validate, call a mutation through RMW, and map domain errors to HTTP codes. Pages (login + queue table + create/edit forms) are server/client components on top of those APIs. `middleware.ts` gates `/cabinet` + `/api/*`.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Vitest 3 (node env; esbuild — runs without type-checking, `tsc --noEmit` is the final gate), zod, `@aws-sdk/client-s3`, `aws-sdk-client-mock`. Auth uses Node's built-in `crypto` (no extra dep).

**Repo:** `c:\Users\Yarrrr\Desktop\promo-cabinet` (git already initialized; the design spec lives in `docs/superpowers/specs/`). Run all commands from that directory.

**Schema agreement:** This `Promo` schema MUST stay identical to abhPromo's `src/services/catalogue-schema.ts` (the two services agree only on this JSON shape). If you implement the abhPromo plan first, copy that schema verbatim.

---

## File Structure

```
promo-cabinet/
  package.json, tsconfig.json, next.config.mjs, vitest.config.ts, .env.example
  src/
    env.ts                         # typed reads of process.env
    lib/
      schema.ts                    # zod promoSchema/catalogueSchema + Promo type
      auth.ts                      # createSessionToken / verifySessionToken (HMAC)
      s3.ts                        # memoized S3Client + catalogueKey + error guards
      mutations.ts                 # pure addPromo/updatePromo/removePromo/reorderPromos + typed errors
      catalogue.ts                 # readCatalogue / writeCatalogue / mutateCatalogue (RMW + ETag)
      api-auth.ts                  # isAuthed(req) for route handlers
    middleware.ts                  # cookie-presence gate for /cabinet + /api
    app/
      layout.tsx, globals.css
      login/page.tsx
      cabinet/page.tsx             # queue table (server component: reads catalogue)
      cabinet/new/page.tsx
      cabinet/[id]/page.tsx
      api/login/route.ts           # POST
      api/logout/route.ts          # POST
      api/promos/route.ts          # GET, POST
      api/promos/[id]/route.ts     # PUT, DELETE
      api/promos/reorder/route.ts  # PUT
    components/
      PromoForm.tsx                # client form (create/edit)
      PromoTable.tsx               # client table (rows + move/delete buttons)
```

---

## Task 1: Scaffold the Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `.env.example`
- Create: `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/env.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "promo-cabinet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.0",
    "@aws-sdk/client-s3": "^3.600.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "aws-sdk-client-mock": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node', globals: false },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

- [ ] **Step 5: Create `.env.example`**

```bash
# Cabinet admin credentials + session signing
ADMIN_USER=admin
ADMIN_PASSWORD=change-me
SESSION_SECRET=replace-with-a-long-random-string

# S3 (bucket provisioned later by the user)
AWS_REGION=us-east-1
PROMO_BUCKET=
PROMO_KEY_PREFIX=
# AWS credentials via the standard SDK chain (env / shared config / role)
```

- [ ] **Step 6: Create `src/env.ts`**

```ts
/**
 * Typed, centralized reads of process.env (server-only). Uses lazy getters so each
 * access reflects the current environment — this keeps tests simple (set process.env
 * in beforeEach, no module-reset needed) and avoids stale values.
 */
export const env = {
  get adminUser() { return process.env.ADMIN_USER ?? ''; },
  get adminPassword() { return process.env.ADMIN_PASSWORD ?? ''; },
  get sessionSecret() { return process.env.SESSION_SECRET ?? ''; },
  get awsRegion() { return process.env.AWS_REGION ?? 'us-east-1'; },
  get promoBucket() { return process.env.PROMO_BUCKET ?? ''; },
  get promoKeyPrefix() { return process.env.PROMO_KEY_PREFIX ?? ''; },
};
```

Note: because `getS3Client()` memoizes the client with `env.awsRegion` on first use, region is fixed per process — fine, since it never changes mid-run. The bucket/prefix are read per request in `catalogue.ts`, so they always reflect current env.

- [ ] **Step 7: Create `src/app/globals.css`**

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; max-width: 960px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
label { display: block; margin: 0.5rem 0 0.2rem; font-weight: 600; }
input, select, textarea { width: 100%; padding: 0.4rem; }
button { padding: 0.4rem 0.8rem; cursor: pointer; }
.row { display: flex; gap: 0.5rem; align-items: center; }
.error { color: #b00; }
```

- [ ] **Step 8: Create `src/app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Promo Cabinet' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: completes; `node_modules/` populated, `package-lock.json` written.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs vitest.config.ts .env.example src/env.ts src/app/layout.tsx src/app/globals.css
git commit -m "chore: scaffold Next.js promo-cabinet project"
```

---

## Task 2: Promo schema

**Files:**
- Create: `src/lib/schema.ts`
- Create: `src/lib/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { promoSchema, catalogueSchema, type Promo } from './schema';

const valid: Promo = {
  id: 'summer-sale',
  name: 'Summer Sale',
  startsAt: '2024-01-01T00:00:00.000Z',
  endsAt: '2024-12-31T00:00:00.000Z',
  targeting: { minAge: 18, regions: ['ru'], subscriptionLevels: ['plus'] },
  maxImpressionsPerUser: 3,
  cooldownHours: 24,
  format: 'popup',
  title: 'Распродажа',
  description: 'desc',
  imageUrl: 'https://cdn.example.com/x.png',
  action: { href: '/sale', label: 'Подробнее' },
  dismissible: true,
};

describe('promoSchema', () => {
  it('accepts a fully-valid promo', () => {
    expect(() => promoSchema.parse(valid)).not.toThrow();
  });

  it('accepts a minimal promo (only required fields)', () => {
    expect(() =>
      promoSchema.parse({
        id: 'p',
        name: 'P',
        startsAt: '2024-01-01T00:00:00.000Z',
        endsAt: '2024-02-01T00:00:00.000Z',
        targeting: {},
        maxImpressionsPerUser: 0,
        cooldownHours: 0,
        format: 'inline',
        title: 'T',
      }),
    ).not.toThrow();
  });

  it('rejects an empty id', () => {
    expect(() => promoSchema.parse({ ...valid, id: '' })).toThrow();
  });

  it('rejects endsAt before startsAt', () => {
    expect(() =>
      promoSchema.parse({ ...valid, startsAt: '2024-12-31T00:00:00.000Z', endsAt: '2024-01-01T00:00:00.000Z' }),
    ).toThrow();
  });

  it('rejects a negative cooldownHours', () => {
    expect(() => promoSchema.parse({ ...valid, cooldownHours: -1 })).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => promoSchema.parse({ ...valid, format: 'banner' })).toThrow();
  });

  it('rejects an action without href', () => {
    expect(() => promoSchema.parse({ ...valid, action: { label: 'x' } })).toThrow();
  });
});

describe('catalogueSchema', () => {
  it('parses an ordered array and preserves order', () => {
    const parsed = catalogueSchema.parse([
      { ...valid, id: 'a' },
      { ...valid, id: 'b' },
    ]);
    expect(parsed.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/schema.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/lib/schema.ts`**

```ts
import { z } from 'zod';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen']);

/**
 * Validation source of truth for a promo. MUST match abhPromo's catalogue-schema.ts.
 * The `startsAt < endsAt` rule is enforced with a refinement.
 */
export const promoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    targeting: z.object({
      minAge: z.number().int().nonnegative().optional(),
      maxAge: z.number().int().nonnegative().optional(),
      regions: z.array(z.string()).optional(),
      subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
    }),
    maxImpressionsPerUser: z.number().int().nonnegative(),
    cooldownHours: z.number().int().nonnegative(),
    format: promoFormatSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    action: z.object({ href: z.string().min(1), label: z.string().optional() }).optional(),
    dismissible: z.boolean().optional(),
  })
  .refine((p) => new Date(p.startsAt).getTime() < new Date(p.endsAt).getTime(), {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
  });

export const catalogueSchema = z.array(promoSchema);

export type Promo = z.infer<typeof promoSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schema.ts src/lib/schema.test.ts
git commit -m "feat: add promo/catalogue zod schema"
```

---

## Task 3: Session auth (HMAC cookie)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_COOKIE } from './auth';

const secret = 'test-secret-please-change';

describe('session tokens', () => {
  it('verifies a token it just created', () => {
    const token = createSessionToken(secret);
    expect(verifySessionToken(token, secret)).toBe(true);
  });

  it('rejects an undefined token', () => {
    expect(verifySessionToken(undefined, secret)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken('other-secret');
    expect(verifySessionToken(token, secret)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken(secret);
    const tampered = token.replace(/^admin\./, 'attacker.');
    expect(verifySessionToken(tampered, secret)).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(verifySessionToken('garbage', secret)).toBe(false);
  });

  it('exposes a stable cookie name', () => {
    expect(SESSION_COOKIE).toBe('promo_session');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/lib/auth.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'promo_session';

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/** Signed session token: `admin.<issuedAtMs>.<hmac>`. Single shared admin identity. */
export function createSessionToken(secret: string, now: number = Date.now()): string {
  const value = `admin.${now}`;
  return `${value}.${sign(value, secret)}`;
}

/** Constant-time verification of a session token's signature. */
export function verifySessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;
  const value = token.slice(0, lastDot);
  const provided = token.slice(lastDot + 1);
  const expected = sign(value, secret);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: add HMAC-signed session token helpers"
```

---

## Task 4: S3 client + helpers

**Files:**
- Create: `src/lib/s3.ts`

- [ ] **Step 1: Create `src/lib/s3.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@/env';

let client: S3Client | null = null;

/** Lazily-constructed singleton S3 client. Creds via the standard AWS SDK chain. */
export function getS3Client(): S3Client {
  if (!client) client = new S3Client({ region: env.awsRegion });
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

/** True when a conditional write was rejected (ETag mismatch / object already exists). */
export function isPreconditionFailed(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'PreconditionFailed' || e?.$metadata?.httpStatusCode === 412;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/s3.ts
git commit -m "feat: add S3 client + key/error helpers"
```

---

## Task 5: Pure catalogue mutations

**Files:**
- Create: `src/lib/mutations.ts`
- Create: `src/lib/mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/mutations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addPromo,
  updatePromo,
  removePromo,
  reorderPromos,
  DuplicateIdError,
  NotFoundError,
  ReorderMismatchError,
} from './mutations';
import type { Promo } from './schema';

const make = (id: string): Promo => ({
  id,
  name: id,
  startsAt: '2024-01-01T00:00:00.000Z',
  endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {},
  maxImpressionsPerUser: 0,
  cooldownHours: 0,
  format: 'inline',
  title: id,
});

describe('addPromo', () => {
  it('appends to the end of the queue', () => {
    const result = addPromo([make('a')], make('b'));
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('throws DuplicateIdError when the id already exists', () => {
    expect(() => addPromo([make('a')], make('a'))).toThrow(DuplicateIdError);
  });

  it('does not mutate the input array', () => {
    const input = [make('a')];
    addPromo(input, make('b'));
    expect(input).toHaveLength(1);
  });
});

describe('updatePromo', () => {
  it('replaces by id and preserves position', () => {
    const result = updatePromo([make('a'), make('b'), make('c')], 'b', { ...make('b'), title: 'New' });
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(result[1].title).toBe('New');
  });

  it('throws NotFoundError when the id is missing', () => {
    expect(() => updatePromo([make('a')], 'zzz', make('zzz'))).toThrow(NotFoundError);
  });
});

describe('removePromo', () => {
  it('removes by id', () => {
    const result = removePromo([make('a'), make('b')], 'a');
    expect(result.map((p) => p.id)).toEqual(['b']);
  });

  it('throws NotFoundError when the id is missing', () => {
    expect(() => removePromo([make('a')], 'zzz')).toThrow(NotFoundError);
  });
});

describe('reorderPromos', () => {
  it('reorders to the given id sequence', () => {
    const result = reorderPromos([make('a'), make('b'), make('c')], ['c', 'a', 'b']);
    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('throws ReorderMismatchError when ids are not a permutation', () => {
    expect(() => reorderPromos([make('a'), make('b')], ['a'])).toThrow(ReorderMismatchError);
    expect(() => reorderPromos([make('a'), make('b')], ['a', 'b', 'c'])).toThrow(ReorderMismatchError);
    expect(() => reorderPromos([make('a'), make('b')], ['a', 'a'])).toThrow(ReorderMismatchError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/mutations.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/lib/mutations.ts`**

```ts
import type { Promo } from './schema';

export class DuplicateIdError extends Error {}
export class NotFoundError extends Error {}
export class ReorderMismatchError extends Error {}

/** Append a promo to the end of the queue. Rejects a duplicate id. */
export function addPromo(promos: Promo[], promo: Promo): Promo[] {
  if (promos.some((p) => p.id === promo.id)) {
    throw new DuplicateIdError(`promo "${promo.id}" already exists`);
  }
  return [...promos, promo];
}

/** Replace a promo by id, preserving its queue position. */
export function updatePromo(promos: Promo[], id: string, next: Promo): Promo[] {
  const idx = promos.findIndex((p) => p.id === id);
  if (idx === -1) throw new NotFoundError(`promo "${id}" not found`);
  const copy = promos.slice();
  copy[idx] = next;
  return copy;
}

/** Remove a promo by id. */
export function removePromo(promos: Promo[], id: string): Promo[] {
  if (!promos.some((p) => p.id === id)) throw new NotFoundError(`promo "${id}" not found`);
  return promos.filter((p) => p.id !== id);
}

/** Reorder the queue to match `ids`, which must be a permutation of the current ids. */
export function reorderPromos(promos: Promo[], ids: string[]): Promo[] {
  const current = promos.map((p) => p.id);
  const sameLength = ids.length === current.length;
  const sameSet = new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!sameLength || !sameSet) {
    throw new ReorderMismatchError('ids must be a permutation of the current promo ids');
  }
  const byId = new Map(promos.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)!);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/mutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mutations.ts src/lib/mutations.test.ts
git commit -m "feat: add pure catalogue mutations (add/update/remove/reorder)"
```

---

## Task 6: Catalogue RMW layer (read/write/mutate with ETag)

**Files:**
- Create: `src/lib/catalogue.ts`
- Create: `src/lib/catalogue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalogue.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readCatalogue, mutateCatalogue, CatalogueConflictError } from './catalogue';
import { addPromo } from './mutations';
import { resetS3ClientForTests } from './s3';
import type { Promo } from './schema';

const s3Mock = mockClient(S3Client);
const body = (text: string) => ({ transformToString: async () => text }) as never;

const make = (id: string): Promo => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: id,
});

beforeEach(() => {
  s3Mock.reset();
  resetS3ClientForTests();
});
afterEach(() => s3Mock.reset());

describe('readCatalogue', () => {
  it('returns parsed promos + the ETag', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([make('a')])), ETag: '"v1"' });
    const { promos, etag } = await readCatalogue();
    expect(promos.map((p) => p.id)).toEqual(['a']);
    expect(etag).toBe('"v1"');
  });

  it('returns an empty catalogue when the object does not exist', async () => {
    s3Mock.on(GetObjectCommand).rejects(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));
    const { promos, etag } = await readCatalogue();
    expect(promos).toEqual([]);
    expect(etag).toBeUndefined();
  });
});

describe('mutateCatalogue', () => {
  it('reads, applies the mutation, and writes with If-Match', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([make('a')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const result = await mutateCatalogue((promos) => addPromo(promos, make('b')));
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
    const putCall = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(putCall.args[0].input.IfMatch).toBe('"v1"');
  });

  it('retries on a 412 precondition failure, then succeeds', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([make('a')])), ETag: '"v1"' });
    s3Mock
      .on(PutObjectCommand)
      .rejectsOnce(Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' }))
      .resolves({});
    const result = await mutateCatalogue((promos) => addPromo(promos, make('b')));
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(2);
  });

  it('throws CatalogueConflictError after exhausting retries', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([make('a')])), ETag: '"v1"' });
    s3Mock
      .on(PutObjectCommand)
      .rejects(Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed' }));
    await expect(mutateCatalogue((p) => p)).rejects.toThrow(CatalogueConflictError);
  });

  it('does not retry (propagates) a domain error thrown by the mutation', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([make('a')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    await expect(mutateCatalogue(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/catalogue.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/lib/catalogue.ts`**

```ts
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { catalogueKey, getS3Client, isNoSuchKey, isPreconditionFailed } from './s3';
import { catalogueSchema, type Promo } from './schema';

const MAX_ATTEMPTS = 3;

export class CatalogueConflictError extends Error {}

/** Reads catalogue.json. A missing object reads as an empty catalogue (no ETag). */
export async function readCatalogue(): Promise<{ promos: Promo[]; etag?: string }> {
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({ Bucket: env.promoBucket, Key: catalogueKey() }),
    );
    const text = await res.Body!.transformToString();
    return { promos: catalogueSchema.parse(JSON.parse(text)), etag: res.ETag };
  } catch (err) {
    if (isNoSuchKey(err)) return { promos: [] };
    throw err;
  }
}

/** Writes the catalogue. Conditional on the ETag (If-Match), or If-None-Match on create. */
export async function writeCatalogue(promos: Promo[], etag?: string): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.promoBucket,
      Key: catalogueKey(),
      Body: JSON.stringify(promos, null, 2),
      ContentType: 'application/json',
      ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
    }),
  );
}

/**
 * Read-modify-write with optimistic concurrency. `apply` transforms the current
 * promos; the result is written conditionally. On a 412 (someone else wrote first)
 * we re-read and re-apply, up to MAX_ATTEMPTS, then surface a CatalogueConflictError.
 * Domain errors thrown by `apply` (duplicate id, not found, …) propagate immediately.
 */
export async function mutateCatalogue(apply: (promos: Promo[]) => Promo[]): Promise<Promo[]> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { promos, etag } = await readCatalogue();
    const next = apply(promos);
    try {
      await writeCatalogue(next, etag);
      return next;
    } catch (err) {
      if (isPreconditionFailed(err) && attempt < MAX_ATTEMPTS - 1) continue;
      if (isPreconditionFailed(err)) throw new CatalogueConflictError('catalogue write kept conflicting');
      throw err;
    }
  }
  throw new CatalogueConflictError('catalogue write kept conflicting');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/catalogue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalogue.ts src/lib/catalogue.test.ts
git commit -m "feat: add catalogue RMW layer (read/write/mutate with ETag)"
```

---

## Task 7: Login + logout routes

**Files:**
- Create: `src/lib/api-auth.ts`
- Create: `src/app/api/login/route.ts`
- Create: `src/app/api/logout/route.ts`
- Create: `src/app/api/login/route.test.ts`

- [ ] **Step 1: Create `src/lib/api-auth.ts`**

```ts
import type { NextRequest } from 'next/server';
import { env } from '@/env';
import { SESSION_COOKIE, verifySessionToken } from './auth';

/** True when the request carries a valid signed session cookie. */
export function isAuthed(req: NextRequest): boolean {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, env.sessionSecret);
}
```

- [ ] **Step 2: Write the failing test**

Create `src/app/api/login/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env.ADMIN_USER = 'admin';
  process.env.ADMIN_PASSWORD = 'secret';
  process.env.SESSION_SECRET = 'unit-test-secret';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const loginReq = (body: unknown) =>
  new NextRequest('http://localhost/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/login', () => {
  it('sets a session cookie on correct credentials', async () => {
    const res = await POST(loginReq({ user: 'admin', password: 'secret' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/promo_session=/);
  });

  it('returns 401 on wrong credentials', async () => {
    const res = await POST(loginReq({ user: 'admin', password: 'nope' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 400 on a malformed body', async () => {
    const res = await POST(loginReq({ user: 'admin' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/api/login/route.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Write `src/app/api/login/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

const bodySchema = z.object({ user: z.string(), password: z.string() });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const ok = safeEqual(parsed.user, env.adminUser) && safeEqual(parsed.password, env.adminPassword);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(env.sessionSecret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
```

- [ ] **Step 5: Write `src/app/api/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/app/api/login/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api-auth.ts src/app/api/login src/app/api/logout
git commit -m "feat: add login/logout API routes + isAuthed helper"
```

---

## Task 8: Middleware gate

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

/**
 * Cheap edge gate: redirect unauthenticated page requests to /login and 401 unauthed
 * API calls. This only checks cookie PRESENCE (the Edge runtime can't run node:crypto);
 * the authoritative signature check happens in node route handlers + server components
 * (isAuthed / requireSession). /api/login is always allowed.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname === '/api/login') return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/cabinet/:path*', '/api/:path*'],
};
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add auth middleware gate for /cabinet and /api"
```

---

## Task 9: Promos collection route (GET list, POST create)

**Files:**
- Create: `src/app/api/promos/route.ts`
- Create: `src/app/api/promos/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/promos/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { GET, POST } from './route';

const s3Mock = mockClient(S3Client);
const body = (text: string) => ({ transformToString: async () => text }) as never;
const SECRET = 'unit-test-secret';

const validPromo = {
  id: 'a', name: 'A', startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: 'A',
};

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/promos', {
    ...init,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_BUCKET = 'test-bucket';
  s3Mock.reset();
  resetS3ClientForTests();
});
afterEach(() => {
  s3Mock.reset();
  process.env = { ...ORIGINAL };
});

describe('GET /api/promos', () => {
  it('returns the catalogue', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([validPromo])), ETag: '"v1"' });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([validPromo]);
  });

  it('401 without a valid session', async () => {
    const res = await GET(new NextRequest('http://localhost/api/promos'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/promos', () => {
  it('creates a promo (201)', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await POST(authed({ method: 'POST', body: JSON.stringify(validPromo) }));
    expect(res.status).toBe(201);
  });

  it('409 on a duplicate id', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([validPromo])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await POST(authed({ method: 'POST', body: JSON.stringify(validPromo) }));
    expect(res.status).toBe(409);
  });

  it('400 on an invalid promo', async () => {
    const res = await POST(authed({ method: 'POST', body: JSON.stringify({ id: '' }) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/promos/route.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/app/api/promos/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutateCatalogue, readCatalogue, CatalogueConflictError } from '@/lib/catalogue';
import { addPromo, DuplicateIdError } from '@/lib/mutations';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { promos } = await readCatalogue();
    return NextResponse.json(promos);
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
    await mutateCatalogue((promos) => addPromo(promos, promo));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateIdError) return NextResponse.json({ error: 'duplicate_id' }, { status: 409 });
    if (err instanceof CatalogueConflictError) return NextResponse.json({ error: 'conflict' }, { status: 409 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/promos/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/promos/route.ts src/app/api/promos/route.test.ts
git commit -m "feat: GET/POST /api/promos (list + create)"
```

---

## Task 10: Single-promo route (PUT update, DELETE)

**Files:**
- Create: `src/app/api/promos/[id]/route.ts`
- Create: `src/app/api/promos/[id]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/promos/[id]/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { PUT, DELETE } from './route';

const s3Mock = mockClient(S3Client);
const body = (text: string) => ({ transformToString: async () => text }) as never;
const SECRET = 'unit-test-secret';

const promo = (id: string) => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline' as const, title: id,
});

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/promos/a', {
    ...init,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });
const ctx = (id: string) => ({ params: { id } });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_BUCKET = 'test-bucket';
  s3Mock.reset();
  resetS3ClientForTests();
});
afterEach(() => {
  s3Mock.reset();
  process.env = { ...ORIGINAL };
});

describe('PUT /api/promos/[id]', () => {
  it('updates an existing promo (200)', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([promo('a')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({ ...promo('a'), title: 'New' }) }), ctx('a'));
    expect(res.status).toBe(200);
  });

  it('404 when the id is missing', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([promo('a')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify(promo('zzz')) }), ctx('zzz'));
    expect(res.status).toBe(404);
  });

  it('400 when the body id does not match the path id', async () => {
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify(promo('b')) }), ctx('a'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/promos/[id]', () => {
  it('deletes an existing promo (200)', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([promo('a')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await DELETE(authed({ method: 'DELETE' }), ctx('a'));
    expect(res.status).toBe(200);
  });

  it('404 when the id is missing', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([promo('a')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await DELETE(authed({ method: 'DELETE' }), ctx('zzz'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/promos/[id]/route.test.ts"`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/app/api/promos/[id]/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutateCatalogue, CatalogueConflictError } from '@/lib/catalogue';
import { removePromo, updatePromo, NotFoundError } from '@/lib/mutations';

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
    await mutateCatalogue((promos) => updatePromo(promos, params.id, promo));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (err instanceof CatalogueConflictError) return NextResponse.json({ error: 'conflict' }, { status: 409 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    await mutateCatalogue((promos) => removePromo(promos, params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (err instanceof CatalogueConflictError) return NextResponse.json({ error: 'conflict' }, { status: 409 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/promos/[id]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/promos/[id]/route.ts" "src/app/api/promos/[id]/route.test.ts"
git commit -m "feat: PUT/DELETE /api/promos/[id] (update + delete)"
```

---

## Task 11: Reorder route

**Files:**
- Create: `src/app/api/promos/reorder/route.ts`
- Create: `src/app/api/promos/reorder/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/promos/reorder/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resetS3ClientForTests } from '@/lib/s3';
import { createSessionToken } from '@/lib/auth';
import { PUT } from './route';

const s3Mock = mockClient(S3Client);
const body = (text: string) => ({ transformToString: async () => text }) as never;
const SECRET = 'unit-test-secret';

const promo = (id: string) => ({
  id, name: id, startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z',
  targeting: {}, maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline' as const, title: id,
});

const ORIGINAL = { ...process.env };
const authed = (init: RequestInit = {}) =>
  new NextRequest('http://localhost/api/promos/reorder', {
    ...init,
    headers: { 'content-type': 'application/json', cookie: `promo_session=${createSessionToken(SECRET)}`, ...(init.headers ?? {}) },
  });

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.PROMO_BUCKET = 'test-bucket';
  s3Mock.reset();
  resetS3ClientForTests();
});
afterEach(() => {
  s3Mock.reset();
  process.env = { ...ORIGINAL };
});

describe('PUT /api/promos/reorder', () => {
  it('reorders to the given id sequence (200)', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([promo('a'), promo('b')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({ ids: ['b', 'a'] }) }));
    expect(res.status).toBe(200);
    const put = s3Mock.commandCalls(PutObjectCommand)[0];
    const written = JSON.parse(put.args[0].input.Body as string).map((p: { id: string }) => p.id);
    expect(written).toEqual(['b', 'a']);
  });

  it('400 when ids are not a permutation', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([promo('a'), promo('b')])), ETag: '"v1"' });
    s3Mock.on(PutObjectCommand).resolves({});
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({ ids: ['a'] }) }));
    expect(res.status).toBe(400);
  });

  it('400 on a malformed body', async () => {
    const res = await PUT(authed({ method: 'PUT', body: JSON.stringify({}) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/promos/reorder/route.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/app/api/promos/reorder/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { mutateCatalogue, CatalogueConflictError } from '@/lib/catalogue';
import { reorderPromos, ReorderMismatchError } from '@/lib/mutations';

export const runtime = 'nodejs';

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let ids: string[];
  try {
    ids = bodySchema.parse(await req.json()).ids;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    await mutateCatalogue((promos) => reorderPromos(promos, ids));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReorderMismatchError) return NextResponse.json({ error: 'reorder_mismatch' }, { status: 400 });
    if (err instanceof CatalogueConflictError) return NextResponse.json({ error: 'conflict' }, { status: 409 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/promos/reorder/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/promos/reorder
git commit -m "feat: PUT /api/promos/reorder"
```

---

## Task 12: UI — login page, queue table, create/edit forms

These are presentational. No automated tests (logic is fully covered in lib/api); verify by `tsc` + `next build` in Task 13.

**Files:**
- Create: `src/lib/require-session.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/components/PromoForm.tsx`
- Create: `src/components/PromoTable.tsx`
- Create: `src/app/cabinet/page.tsx`
- Create: `src/app/cabinet/new/page.tsx`
- Create: `src/app/cabinet/[id]/page.tsx`

- [ ] **Step 1: Create `src/lib/require-session.ts`** (authoritative server-component gate)

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/env';
import { SESSION_COOKIE, verifySessionToken } from './auth';

/** Server-component guard: redirects to /login unless a valid session cookie is present. */
export function requireSession(): void {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token, env.sessionSecret)) redirect('/login');
}
```

- [ ] **Step 2: Create `src/app/login/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });
    if (res.ok) router.push('/cabinet');
    else setError('Неверный логин или пароль');
  }

  return (
    <main>
      <h1>Вход в кабинет</h1>
      <form onSubmit={submit}>
        <label htmlFor="user">Логин</label>
        <input id="user" value={user} onChange={(e) => setUser(e.target.value)} />
        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <p><button type="submit">Войти</button></p>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create `src/components/PromoForm.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

const FORMATS = ['inline', 'popup', 'fullscreen'] as const;
const empty: Promo = {
  id: '', name: '', startsAt: '', endsAt: '', targeting: {},
  maxImpressionsPerUser: 0, cooldownHours: 0, format: 'inline', title: '',
};

export function PromoForm({ initial, mode }: { initial?: Promo; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const [p, setP] = useState<Promo>(initial ?? empty);
  const [error, setError] = useState('');
  const set = (patch: Partial<Promo>) => setP((cur) => ({ ...cur, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const url = mode === 'create' ? '/api/promos' : `/api/promos/${encodeURIComponent(p.id)}`;
    const method = mode === 'create' ? 'POST' : 'PUT';
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
    if (res.ok) router.push('/cabinet');
    else {
      const data = await res.json().catch(() => ({}));
      setError(`Ошибка: ${data.error ?? res.status}`);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>ID (slug)</label>
      <input value={p.id} disabled={mode === 'edit'} onChange={(e) => set({ id: e.target.value })} />
      <label>Название (внутреннее)</label>
      <input value={p.name} onChange={(e) => set({ name: e.target.value })} />
      <label>Заголовок</label>
      <input value={p.title} onChange={(e) => set({ title: e.target.value })} />
      <label>Описание</label>
      <textarea value={p.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} />
      <label>Картинка (URL)</label>
      <input value={p.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value || undefined })} />
      <label>Начало (ISO 8601)</label>
      <input value={p.startsAt} placeholder="2024-01-01T00:00:00.000Z" onChange={(e) => set({ startsAt: e.target.value })} />
      <label>Конец (ISO 8601)</label>
      <input value={p.endsAt} placeholder="2024-12-31T00:00:00.000Z" onChange={(e) => set({ endsAt: e.target.value })} />
      <label>Формат</label>
      <select value={p.format} onChange={(e) => set({ format: e.target.value as Promo['format'] })}>
        {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <label>Макс. показов на пользователя (0 = без лимита)</label>
      <input type="number" min={0} value={p.maxImpressionsPerUser}
        onChange={(e) => set({ maxImpressionsPerUser: Number(e.target.value) })} />
      <label>Кулдаун, часов (0 = без кулдауна)</label>
      <input type="number" min={0} value={p.cooldownHours}
        onChange={(e) => set({ cooldownHours: Number(e.target.value) })} />
      <label>CTA href (необязательно)</label>
      <input value={p.action?.href ?? ''}
        onChange={(e) => set({ action: e.target.value ? { href: e.target.value, label: p.action?.label } : undefined })} />
      <label>CTA label (необязательно)</label>
      <input value={p.action?.label ?? ''} disabled={!p.action?.href}
        onChange={(e) => set({ action: p.action?.href ? { href: p.action.href, label: e.target.value || undefined } : undefined })} />
      {error && <p className="error">{error}</p>}
      <p className="row">
        <button type="submit">Сохранить</button>
        <button type="button" onClick={() => router.push('/cabinet')}>Отмена</button>
      </p>
    </form>
  );
}
```

- [ ] **Step 4: Create `src/components/PromoTable.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Promo } from '@/lib/schema';

function isActive(p: Promo): boolean {
  const now = Date.now();
  return new Date(p.startsAt).getTime() <= now && now <= new Date(p.endsAt).getTime();
}

export function PromoTable({ promos }: { promos: Promo[] }) {
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
    await fetch('/api/promos/reorder', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: next.map((p) => p.id) }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm(`Удалить промо "${id}"?`)) return;
    setBusy(true);
    await fetch(`/api/promos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setOrder((cur) => cur.filter((p) => p.id !== id));
    setBusy(false);
    router.refresh();
  }

  return (
    <table>
      <thead>
        <tr>
          <th>#</th><th>Заголовок</th><th>Формат</th><th>Активен</th>
          <th>Лимит</th><th>Кулдаун, ч</th><th>Порядок</th><th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {order.map((p, i) => (
          <tr key={p.id}>
            <td>{i + 1}</td>
            <td>{p.title}</td>
            <td>{p.format}</td>
            <td>{isActive(p) ? '✓' : '—'}</td>
            <td>{p.maxImpressionsPerUser || '∞'}</td>
            <td>{p.cooldownHours}</td>
            <td className="row">
              <button disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
              <button disabled={busy || i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
            </td>
            <td className="row">
              <button onClick={() => router.push(`/cabinet/${encodeURIComponent(p.id)}`)}>Изменить</button>
              <button disabled={busy} onClick={() => remove(p.id)}>Удалить</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Create `src/app/cabinet/page.tsx`**

```tsx
import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { readCatalogue } from '@/lib/catalogue';
import { PromoTable } from '@/components/PromoTable';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  let promos;
  try {
    ({ promos } = await readCatalogue());
  } catch {
    return <main><h1>Очередь промо</h1><p className="error">Не удалось прочитать каталог из S3.</p></main>;
  }
  return (
    <main>
      <h1>Очередь промо</h1>
      <p><Link href="/cabinet/new">+ Новое промо</Link></p>
      {promos.length === 0 ? <p>Промо пока нет.</p> : <PromoTable promos={promos} />}
    </main>
  );
}
```

- [ ] **Step 6: Create `src/app/cabinet/new/page.tsx`**

```tsx
import { requireSession } from '@/lib/require-session';
import { PromoForm } from '@/components/PromoForm';

export default function NewPromoPage() {
  requireSession();
  return (
    <main>
      <h1>Новое промо</h1>
      <PromoForm mode="create" />
    </main>
  );
}
```

- [ ] **Step 7: Create `src/app/cabinet/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readCatalogue } from '@/lib/catalogue';
import { PromoForm } from '@/components/PromoForm';

export const dynamic = 'force-dynamic';

export default async function EditPromoPage({ params }: { params: { id: string } }) {
  requireSession();
  const { promos } = await readCatalogue();
  const promo = promos.find((p) => p.id === params.id);
  if (!promo) notFound();
  return (
    <main>
      <h1>Редактирование: {promo.title}</h1>
      <PromoForm mode="edit" initial={promo} />
    </main>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/require-session.ts src/app/login src/app/cabinet src/components
git commit -m "feat: cabinet UI (login, queue table, create/edit forms)"
```

---

## Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — schema, auth, mutations, catalogue, and all route tests green.

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: PASS — 0 errors.

- [ ] **Step 3: Production build (compiles pages, routes, middleware)**

Run: `npm run build`
Expected: build succeeds. (No live S3/env needed — pages are `force-dynamic` and only hit S3 at request time.)

- [ ] **Step 4: Final commit (only if Steps 1–3 required fixes; otherwise skip)**

```bash
git add -A
git commit -m "chore: fixes from full verification pass"
```

---

## Done

The cabinet authenticates a single admin, lists the promo queue, and supports create / edit
/ delete / reorder — all persisted to `catalogue.json` on S3 with ETag-guarded RMW. abhPromo
reads that same file. The S3 bucket is provisioned later by the user; until then, `npm test`
(SDK mocked) fully validates the logic. Push to GitHub (`Zebrooo/promo-cabinet`) is a
separate follow-up once the user confirms.
