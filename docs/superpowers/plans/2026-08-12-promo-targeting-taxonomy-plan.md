# Shared Promo Schema + Structured Device/Region/Category Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the audience-targeting slice of the `Promo` schema (age/region/subscription/section/category/audience/sellerStatus/deviceTarget) into a new shared package `@zebrooo/promo-schema`, close `regions` and `sections` over canonical enums instead of free text, and add an explicit `app` device-target value that doesn't exist today.

**Architecture:** A new minimal package (`@zebrooo/promo-schema`, published to GitHub Packages exactly like the existing `@zebrooo/service-ticket`) exports Zod schemas + inferred types for just the targeting-relevant fields, plus the canonical taxonomy constants (`REGIONS`, `CATEGORIES`, `DEVICE_TARGETS`). `promo-bff`'s `catalogue-schema.ts` and `promo-cabinet`'s `schema.ts` both import from it instead of hand-duplicating. `categories` (deeper than `sections`) stays free text in this plan — its runtime granularity against abkhaz-auto's `context.category` isn't confirmed, so closing it now risks silently mismatching; that's a follow-up investigation, not part of this plan.

**Tech Stack:** TypeScript, Zod 3, `tsup` (package bundling), Vitest 3, Fastify 5 (`promo-bff`), Next.js 14 + Formik (`promo-cabinet`).

## Global Constraints

- The `Promo` domain type (`promo-bff/src/promo-selector/types.ts`) stays loosely typed (`regions?: string[]`, `sections?: string[]`) for the checker layer — only the Zod validation layer and the cabinet UI enforce the closed enum. Exception: `deviceTarget` gains a real new literal (`'app'`) because `DeviceChecker`'s matching logic changes, not just validation.
- `regionSchema`/`categorySchema` values come from `@zebrooo/promo-schema`, not redefined locally in either consuming repo.
- No change to `ad_campaigns`/`run-auction.ts`/abkhaz-auto's advertiser cabinet — out of scope.
- Every task ends with `npm test` and `npm run typecheck` green in the repo it touches.

---

## File Structure

**New repo `promo-schema`** (local clone path: `/Users/dmitrii/projects/_services/promo-schema`):
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `.gitignore`
- Create: `src/taxonomy.ts` — `REGIONS`, `CATEGORIES` readonly arrays
- Create: `src/schema.ts` — `subscriptionLevelSchema`, `regionSchema`, `categorySchema`, `audienceSchema`, `sellerStatusSchema`, `deviceTargetSchema`, `DEVICE_TARGETS`, `promoTargetingSchema`, `promoServingTargetingSchema` + inferred types
- Create: `src/index.ts` — re-exports
- Test: `src/schema.test.ts`

**`promo-bff`** (branch `feat/promo-targeting-taxonomy`, already checked out):
- Create: `scripts/audit-taxonomy.ts` — one-off read-only S3 pool audit
- Modify: `package.json` — add `@zebrooo/promo-schema` dependency
- Modify: `src/services/catalogue-schema.ts:4,6,7,15-20,74-77,83` — import shared schema pieces
- Modify: `src/promo-selector/types.ts:2-13,88` — `deviceTarget` gains `'app'`
- Modify: `src/promo-selector/checkers/registry/Device.ts:29-35` — explicit `app` matching branch
- Test: `src/promo-selector/checkers/registry/Device.test.ts` — new cases for explicit `app` targeting

**`promo-cabinet`** (branch `feat/promo-targeting-taxonomy`, already checked out):
- Modify: `package.json` — add `@zebrooo/promo-schema` dependency
- Modify: `src/lib/schema.ts:4,8,9,60,76` — import shared schema pieces
- Modify: `src/lib/schema.test.ts:17,110-111,424` — fixture regions `'ru'` → `'sukhum'` (now enum-constrained)
- Modify: `src/components/promo-form/sections/TargetingSection.tsx:38-41,79-86` — regions/sections become closed multiselects
- Modify: `src/components/promo-form/sections/DevicePlacementSection.tsx:12-22,60-64` — 4th `app` pill

---

## Task 1: Scaffold and publish `@zebrooo/promo-schema` v0.1.0

**Files:**
- Create (new repo): `package.json`, `tsconfig.json`, `tsup.config.ts`, `.gitignore`, `src/taxonomy.ts`, `src/schema.ts`, `src/index.ts`, `src/schema.test.ts`

**Interfaces:**
- Produces: `REGIONS: readonly string[]`, `CATEGORIES: readonly string[]`, `DEVICE_TARGETS: readonly string[]`, `regionSchema`, `categorySchema`, `subscriptionLevelSchema`, `audienceSchema`, `sellerStatusSchema`, `deviceTargetSchema` (Zod), `promoTargetingSchema`, `promoServingTargetingSchema` (Zod objects), `type Region`, `type Category`, `type SubscriptionLevel`, `type Audience`, `type SellerStatus`, `type DeviceTarget`, `type PromoTargeting`, `type PromoServingTargeting`.

- [ ] **Step 1: Create the repo and scaffold package files**

This step creates a new GitHub repository under the `Zebrooo` org and publishes a package to its GitHub Packages registry — both are visible, org-affecting actions. **Confirm with the user before running this step.**

```bash
mkdir -p /Users/dmitrii/projects/_services/promo-schema && cd /Users/dmitrii/projects/_services/promo-schema
git init
```

`package.json`:
```json
{
  "name": "@zebrooo/promo-schema",
  "version": "0.1.0",
  "description": "Shared audience-targeting schema (age/region/subscription/section/category/device) for promo-bff and promo-cabinet.",
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "repository": { "type": "git", "url": "git+https://github.com/Zebrooo/promo-schema.git" },
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "zod": "^3.25.0"
  }
}
```

`tsconfig.json` (identical to `service-ticket`'s):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

`tsup.config.ts` (identical to `service-ticket`'s):
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
```

`.gitignore`:
```
node_modules
dist
*.log
```

- [ ] **Step 2: Write the taxonomy constants**

`src/taxonomy.ts`:
```ts
/**
 * Canonical Abkhazia locations, mirroring abkhaz-auto's `regions.slug`.
 * Hardcoded — this list changes on the order of years. Bump here manually
 * when abkhaz-auto adds a region to its `regions` table.
 */
export const REGIONS = [
  'sukhum',
  'gagra',
  'pitsunda',
  'gudauta',
  'novy-afon',
  'ochamchyra',
  'gulrypsh',
  'tkuarchal',
  'gal',
] as const;

/**
 * Top-level listing sections, mirroring abkhaz-auto's `home-data.ts` CATEGORIES
 * slugs. Deliberately top-level only — brand/model or goods-subcategory
 * drill-down is a separate future package addition, not part of v1.
 */
export const CATEGORIES = [
  'avto',
  'zapchasti',
  'shiny',
  'diski',
  'nedvizhimost',
  'uslugi',
  'rabota',
  'elektronika',
  'kompyutery',
  'odezhda',
  'tovary-doma',
  'mebel',
  'hobby',
  'zhivotnye',
  'oborudovanie',
  'raznoye',
  'baraholka',
  'daily',
  'garages',
] as const;
```

- [ ] **Step 3: Write the failing schema test**

`src/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  regionSchema,
  categorySchema,
  deviceTargetSchema,
  DEVICE_TARGETS,
  promoTargetingSchema,
  promoServingTargetingSchema,
} from './schema';

describe('regionSchema', () => {
  it('accepts a canonical region', () => {
    expect(regionSchema.parse('sukhum')).toBe('sukhum');
  });
  it('rejects an unknown region', () => {
    expect(() => regionSchema.parse('moscow')).toThrow();
  });
});

describe('categorySchema', () => {
  it('accepts a canonical category', () => {
    expect(categorySchema.parse('avto')).toBe('avto');
  });
  it('rejects an unknown category', () => {
    expect(() => categorySchema.parse('yachts')).toThrow();
  });
});

describe('deviceTargetSchema', () => {
  it('accepts all four values including the new app', () => {
    for (const v of ['desktop', 'touch', 'app', 'both']) {
      expect(deviceTargetSchema.parse(v)).toBe(v);
    }
  });
  it('DEVICE_TARGETS lists all four values', () => {
    expect(DEVICE_TARGETS).toEqual(['desktop', 'touch', 'app', 'both']);
  });
});

describe('promoTargetingSchema', () => {
  it('accepts a fully-populated targeting object', () => {
    const parsed = promoTargetingSchema.parse({
      minAge: 18,
      maxAge: 65,
      regions: ['sukhum', 'gagra'],
      subscriptionLevels: ['plus'],
    });
    expect(parsed.regions).toEqual(['sukhum', 'gagra']);
  });
  it('accepts an empty object (no targeting rules)', () => {
    expect(() => promoTargetingSchema.parse({})).not.toThrow();
  });
  it('rejects an out-of-enum region inside targeting', () => {
    expect(() => promoTargetingSchema.parse({ regions: ['moscow'] })).toThrow();
  });
});

describe('promoServingTargetingSchema', () => {
  it('accepts sections from the canonical list and rejects unknown ones', () => {
    expect(promoServingTargetingSchema.parse({ targeting: {}, sections: ['avto'] }).sections).toEqual(['avto']);
    expect(() => promoServingTargetingSchema.parse({ targeting: {}, sections: ['not-a-section'] })).toThrow();
  });
  it('accepts audience/sellerStatus/deviceTarget', () => {
    const parsed = promoServingTargetingSchema.parse({
      targeting: {},
      audience: 'authenticated',
      sellerStatus: 'seller',
      deviceTarget: 'app',
    });
    expect(parsed.audience).toBe('authenticated');
    expect(parsed.sellerStatus).toBe('seller');
    expect(parsed.deviceTarget).toBe('app');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd /Users/dmitrii/projects/_services/promo-schema && npm install && npx vitest run`
Expected: FAIL — `Cannot find module './schema'` (file doesn't exist yet).

- [ ] **Step 5: Write the schema implementation**

`src/schema.ts`:
```ts
import { z } from 'zod';
import { REGIONS, CATEGORIES } from './taxonomy';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export type SubscriptionLevel = z.infer<typeof subscriptionLevelSchema>;

export const regionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof regionSchema>;

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const audienceSchema = z.enum(['all', 'authenticated', 'anonymous']);
export type Audience = z.infer<typeof audienceSchema>;

export const sellerStatusSchema = z.enum(['seller', 'buyer']);
export type SellerStatus = z.infer<typeof sellerStatusSchema>;

/**
 * 'app' is the native WebView surface (abkhaz-auto's `isAppSurface()`), distinct
 * from generic mobile-web `touch`. 'both' means "any device" (the default).
 */
export const deviceTargetSchema = z.enum(['desktop', 'touch', 'app', 'both']);
export type DeviceTarget = z.infer<typeof deviceTargetSchema>;
export const DEVICE_TARGETS = deviceTargetSchema.options;

export const promoTargetingSchema = z.object({
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  regions: z.array(regionSchema).optional(),
  subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
});
export type PromoTargeting = z.infer<typeof promoTargetingSchema>;

/**
 * The audience-targeting slice of a Promo, shared verbatim between promo-bff's
 * catalogue-schema.ts and promo-cabinet's schema.ts. `categories` is
 * deliberately still free text (`z.string().min(1)`, not `categorySchema`) —
 * its real-world granularity against abkhaz-auto's `context.category` isn't
 * confirmed yet, so closing it now risks silently mismatching live promos.
 */
export const promoServingTargetingSchema = z.object({
  targeting: promoTargetingSchema,
  sections: z.array(categorySchema).optional(),
  categories: z.array(z.string().min(1)).optional(),
  audience: audienceSchema.optional(),
  sellerStatus: sellerStatusSchema.optional(),
  deviceTarget: deviceTargetSchema.optional(),
});
export type PromoServingTargeting = z.infer<typeof promoServingTargetingSchema>;
```

`src/index.ts`:
```ts
export * from './taxonomy';
export * from './schema';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run`
Expected: PASS — all cases green.

- [ ] **Step 7: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed; `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` exist.

- [ ] **Step 8: Commit, push, publish**

```bash
git add -A
git commit -m "feat: shared promo audience-targeting schema + taxonomy"
gh repo create Zebrooo/promo-schema --private --source=. --remote=origin --push
NODE_AUTH_TOKEN=$(gh auth token) npm publish
```
Expected: `gh repo create` succeeds and pushes `main`; `npm publish` reports `+ @zebrooo/promo-schema@0.1.0`.

---

## Task 2: Audit the live S3 pool for out-of-enum region/section values

Do this **before** tightening `promo-bff`'s read-side validation (Task 3) — the pool's `parsePoolLeniently` silently drops any promo that fails the new closed enum, so this step confirms nothing live gets silently un-served.

**Files:**
- Create: `promo-bff/scripts/audit-taxonomy.ts`

**Interfaces:**
- Consumes: `getS3Client`, `promosKey` from `../src/services/s3-client`; `REGIONS`, `CATEGORIES` from `@zebrooo/promo-schema` (available after Task 1).

- [ ] **Step 1: Write the audit script**

`promo-bff/scripts/audit-taxonomy.ts`:
```ts
/**
 * One-off, read-only: lists every regions/sections value in the live S3 pool
 * that is NOT in the new @zebrooo/promo-schema taxonomy. Run before merging
 * Task 3 (which starts rejecting those values on read).
 */
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { REGIONS, CATEGORIES } from '@zebrooo/promo-schema';
import { getS3Client, promosKey } from '../src/services/s3-client';
import { config } from '../src/config';

async function main() {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: promosKey() }),
  );
  const text = await res.Body!.transformToString();
  const pool = JSON.parse(text) as { id: string; targeting?: { regions?: string[] }; sections?: string[] }[];

  const regionSet = new Set<string>(REGIONS);
  const categorySet = new Set<string>(CATEGORIES);
  const badRegions = new Map<string, string[]>();
  const badSections = new Map<string, string[]>();

  for (const promo of pool) {
    for (const r of promo.targeting?.regions ?? []) {
      if (!regionSet.has(r)) badRegions.set(r, [...(badRegions.get(r) ?? []), promo.id]);
    }
    for (const s of promo.sections ?? []) {
      if (!categorySet.has(s)) badSections.set(s, [...(badSections.get(s) ?? []), promo.id]);
    }
  }

  console.log('Out-of-enum region values:', badRegions.size === 0 ? 'none' : Object.fromEntries(badRegions));
  console.log('Out-of-enum section values:', badSections.size === 0 ? 'none' : Object.fromEntries(badSections));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run it against the real pool**

Run: `cd promo-bff && npx tsx scripts/audit-taxonomy.ts` (needs the same S3 env vars the running service uses — `PROMO_BUCKET`, `PROMO_S3_ENDPOINT`, AWS creds).
Expected: prints `none`/`none`, or a list of offending values + which promo ids use them.

**If the output is not `none`/`none`, stop here and report back before continuing to Task 3** — either add the missing value to `REGIONS`/`CATEGORIES` in `@zebrooo/promo-schema` (bump to `0.1.1`), or have the operator fix the offending promo in the cabinet first.

- [ ] **Step 3: Commit**

```bash
git add scripts/audit-taxonomy.ts
git commit -m "chore: add live-pool taxonomy audit script"
```

---

## Task 3: `promo-bff` — adopt `@zebrooo/promo-schema` in `catalogue-schema.ts`

**Files:**
- Modify: `promo-bff/package.json`
- Modify: `promo-bff/src/services/catalogue-schema.ts:1-9,15-20,74-77,83`

**Interfaces:**
- Consumes: `subscriptionLevelSchema`, `audienceSchema`, `sellerStatusSchema`, `deviceTargetSchema`, `promoTargetingSchema` from `@zebrooo/promo-schema` (Task 1).
- Produces: unchanged `promoSchema`/`catalogueSchema`/`parsePoolLeniently` exports — no consumer of this file needs to change.

- [ ] **Step 1: Add the dependency**

Run: `cd promo-bff && NODE_AUTH_TOKEN=$(gh auth token) npm install @zebrooo/promo-schema@^0.1.0`
Expected: `package.json` gains `"@zebrooo/promo-schema": "^0.1.0"` under `dependencies`.

- [ ] **Step 2: Run the existing test suite to confirm the baseline is green**

Run: `npm test`
Expected: PASS (nothing changed yet).

- [ ] **Step 3: Replace the hand-rolled schema pieces with shared imports**

In `src/services/catalogue-schema.ts`, replace lines 1–9:
```ts
import { z } from 'zod';
import type { Promo } from '../promo-selector/types';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip', 'multistep', 'custom']);
export const audienceSchema = z.enum(['all', 'authenticated', 'anonymous']);
export const deviceTargetSchema = z.enum(['desktop', 'touch', 'both']);
```
with:
```ts
import { z } from 'zod';
import type { Promo } from '../promo-selector/types';
import {
  subscriptionLevelSchema,
  audienceSchema,
  sellerStatusSchema,
  deviceTargetSchema,
  regionSchema,
  categorySchema,
} from '@zebrooo/promo-schema';

export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip', 'multistep', 'custom']);
export { subscriptionLevelSchema, audienceSchema, deviceTargetSchema };
```

Replace the `targeting` field (lines 15–20):
```ts
  targeting: z.object({
    minAge: z.number().int().nonnegative().optional(),
    maxAge: z.number().int().nonnegative().optional(),
    regions: z.array(z.string()).optional(),
    subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
  }),
```
with:
```ts
  targeting: z.object({
    minAge: z.number().int().nonnegative().optional(),
    maxAge: z.number().int().nonnegative().optional(),
    regions: z.array(regionSchema).optional(),
    subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
  }),
```

Replace lines 74–77:
```ts
  sections: z.array(z.string().min(1)).optional(),
  categories: z.array(z.string().min(1)).optional(),
  audience: audienceSchema.optional(),
  sellerStatus: z.enum(['seller', 'buyer']).optional(),
```
with:
```ts
  sections: z.array(categorySchema).optional(),
  categories: z.array(z.string().min(1)).optional(),
  audience: audienceSchema.optional(),
  sellerStatus: sellerStatusSchema.optional(),
```

Line 83 (`deviceTarget: deviceTargetSchema.optional(),`) is unchanged — the import now provides the 4-value version automatically.

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: PASS. If `catalogue-schema.test.ts` has fixtures using a non-canonical region/section string, update them to a real value (e.g. `'sukhum'`, `'avto'`) — check with `grep -n "regions:\|sections:" src/services/catalogue-schema.test.ts` first.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/services/catalogue-schema.ts
git commit -m "refactor: adopt @zebrooo/promo-schema for targeting validation"
```

---

## Task 4: `promo-bff` — explicit `app` device target

**Files:**
- Modify: `promo-bff/src/promo-selector/types.ts:88`
- Modify: `promo-bff/src/promo-selector/checkers/registry/Device.ts:29-35`
- Test: `promo-bff/src/promo-selector/checkers/registry/Device.test.ts`

**Interfaces:**
- Consumes: `DeviceTarget` type from `@zebrooo/promo-schema` (Task 1).
- Produces: `Promo['deviceTarget']` now accepts `'app'`; `DeviceChecker.check()` matches `deviceTarget:'app'` only against `ctx.device==='app'`, while `deviceTarget:'touch'` keeps matching both `'touch'` and `'app'` (backward compat — no existing promo's audience shrinks).

- [ ] **Step 1: Write the failing tests**

Append to `src/promo-selector/checkers/registry/Device.test.ts` (inside the existing `describe('DeviceChecker', ...)` block, after the `"'app' device (WebView) — treated as touch-family"` describe block):
```ts
  describe("explicit 'app' deviceTarget", () => {
    it('matches only ctx.device === "app"', () => {
      const appOnly = makePromo({ deviceTarget: 'app' });
      expect(c.check(makeCheckContext({ device: 'app', promo: appOnly }))).toBe(true);
      expect(c.check(makeCheckContext({ device: 'touch', promo: appOnly }))).toBe(false);
      expect(c.check(makeCheckContext({ device: 'desktop', promo: appOnly }))).toBe(false);
    });
    it('a "touch"-targeted promo still matches app (back-compat, unchanged)', () => {
      const touchOnly = makePromo({ deviceTarget: 'touch' });
      expect(c.check(makeCheckContext({ device: 'app', promo: touchOnly }))).toBe(true);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Device.test.ts`
Expected: FAIL — `deviceTarget: 'app'` is not assignable to `Promo['deviceTarget']` (TS error) once you also update `makePromo`'s type usage, or a runtime assertion failure if TS is loose there; either way, red.

- [ ] **Step 3: Extend the `Promo` type**

In `src/promo-selector/types.ts`, replace the import and the `deviceTarget` field (line 88):
```ts
/** Domain types for promo selection. */
import type { DeviceTarget } from '@zebrooo/promo-schema';

export type SubscriptionLevel = 'none' | 'plus' | 'premium';
```
(keep the rest of the file as-is), and change:
```ts
  /** Device gate: 'desktop'/'touch' restricts to that device; 'both'/omitted = any.
   *  Enforced by the DeviceChecker against the request's `device`. */
  deviceTarget?: 'desktop' | 'touch' | 'both';
```
to:
```ts
  /** Device gate: 'desktop'/'touch'/'app' restricts to that device; 'both'/omitted
   *  = any. 'app' matches only the native WebView; 'touch' still matches both
   *  mobile-web AND app for backward compat (see DeviceChecker). Enforced by
   *  the DeviceChecker against the request's `device`. */
  deviceTarget?: DeviceTarget;
```

- [ ] **Step 4: Update `DeviceChecker`**

In `src/promo-selector/checkers/registry/Device.ts`, replace the `check()` method body:
```ts
  check(ctx: CheckContext): boolean {
    const { deviceTarget, format } = ctx.promo;
    // Приложение (WebView) — touch-поверхность: у deviceTarget нет отдельного
    // значения 'app', так что для гейтов трактуем 'app' как 'touch'-семью.
    const family = ctx.device === 'app' ? 'touch' : ctx.device;
    // 1. Explicit advertiser device gate.
    if (deviceTarget !== undefined && deviceTarget !== 'both' && deviceTarget !== family) {
      return false;
    }
    // 2. Format capability gate: touch/app can't render desktop-only formats.
    if (family === 'touch' && DESKTOP_ONLY_FORMATS.has(format)) {
      return false;
    }
    return true;
  }
```
with:
```ts
  check(ctx: CheckContext): boolean {
    const { deviceTarget, format } = ctx.promo;
    // Format-capability purposes only: app is a touch-family surface.
    const family = ctx.device === 'app' ? 'touch' : ctx.device;
    // 1a. Explicit app-only gate: 'app' is a distinct value from 'touch' now —
    // a promo targeting 'app' shows ONLY in the native WebView, never on
    // mobile web. Checked separately so 'touch'-targeted promos keep matching
    // app too (back-compat, see 1b).
    if (deviceTarget === 'app' && ctx.device !== 'app') {
      return false;
    }
    // 1b. Existing desktop/touch/both gate — unchanged, still uses the
    // app→touch family coercion so a 'touch'-targeted promo keeps showing to
    // app viewers exactly as it did before this change.
    if (deviceTarget !== undefined && deviceTarget !== 'app' && deviceTarget !== 'both' && deviceTarget !== family) {
      return false;
    }
    // 2. Format capability gate: touch/app can't render desktop-only formats.
    if (family === 'touch' && DESKTOP_ONLY_FORMATS.has(format)) {
      return false;
    }
    return true;
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- Device.test.ts`
Expected: PASS — all cases including the two new ones.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/promo-selector/types.ts src/promo-selector/checkers/registry/Device.ts src/promo-selector/checkers/registry/Device.test.ts
git commit -m "feat: explicit app device target, distinct from touch"
```

---

## Task 5: `promo-cabinet` — adopt `@zebrooo/promo-schema` in `src/lib/schema.ts`

**Files:**
- Modify: `promo-cabinet/package.json`
- Modify: `promo-cabinet/src/lib/schema.ts:1-9,57-62,76`
- Modify: `promo-cabinet/src/lib/schema.test.ts:17,110-111,424`

**Interfaces:**
- Consumes: same shared exports as Task 3.

- [ ] **Step 1: Add the dependency**

Run: `cd promo-cabinet && NODE_AUTH_TOKEN=$(gh auth token) npm install @zebrooo/promo-schema@^0.1.0`

- [ ] **Step 2: Confirm baseline green**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Update the fixtures that use the now-invalid region `'ru'`**

In `src/lib/schema.test.ts`, line 17:
```ts
  targeting: { minAge: 18, regions: ['ru'], subscriptionLevels: ['plus'] },
```
→
```ts
  targeting: { minAge: 18, regions: ['sukhum'], subscriptionLevels: ['plus'] },
```

Line 424:
```ts
    targeting: { minAge: 18, maxAge: 40, regions: ['ru'], subscriptionLevels: ['plus'] as const },
```
→
```ts
    targeting: { minAge: 18, maxAge: 40, regions: ['sukhum'], subscriptionLevels: ['plus'] as const },
```

Lines 110–111 already use `'sukhum'` — no change needed there, but add one new test right after that block:
```ts
  it('rejects an out-of-enum region', () => {
    expect(() =>
      promoSchema.parse({ ...valid, targeting: { ...valid.targeting, regions: ['moscow'] } }),
    ).toThrow();
  });
```

- [ ] **Step 4: Run the test to verify the new case fails (file doesn't validate the enum yet)**

Run: `npm test -- schema.test.ts`
Expected: the new `'rejects an out-of-enum region'` test FAILS (schema still accepts any string).

- [ ] **Step 5: Replace the hand-rolled schema pieces with shared imports**

In `src/lib/schema.ts`, replace lines 1–9:
```ts
import { z } from 'zod';
import { KNOWN_CUSTOM_VARIANTS } from './custom-variants';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip', 'multistep', 'custom']);
export const promoFormats = promoFormatSchema.options;
export type PromoFormat = z.infer<typeof promoFormatSchema>;
export const audienceSchema = z.enum(['all', 'authenticated', 'anonymous']);
export const deviceTargetSchema = z.enum(['desktop', 'touch', 'both']);
```
with:
```ts
import { z } from 'zod';
import { KNOWN_CUSTOM_VARIANTS } from './custom-variants';
import {
  subscriptionLevelSchema,
  audienceSchema,
  sellerStatusSchema,
  deviceTargetSchema,
  regionSchema,
  categorySchema,
  REGIONS,
  CATEGORIES,
  DEVICE_TARGETS,
} from '@zebrooo/promo-schema';

export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip', 'multistep', 'custom']);
export const promoFormats = promoFormatSchema.options;
export type PromoFormat = z.infer<typeof promoFormatSchema>;
export { subscriptionLevelSchema, audienceSchema, deviceTargetSchema, REGIONS, CATEGORIES, DEVICE_TARGETS };
```

Replace the `targeting` field inside `servingBlockSchema` (lines 57–62):
```ts
  targeting: z.object({
    minAge: z.number().int().nonnegative('Возраст не может быть отрицательным').optional(),
    maxAge: z.number().int().nonnegative('Возраст не может быть отрицательным').optional(),
    regions: z.array(z.string()).optional(),
    subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
  }),
```
with:
```ts
  targeting: z.object({
    minAge: z.number().int().nonnegative('Возраст не может быть отрицательным').optional(),
    maxAge: z.number().int().nonnegative('Возраст не может быть отрицательным').optional(),
    regions: z.array(regionSchema).optional(),
    subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
  }),
```

Replace line 76 (`sections: z.array(z.string().min(1)).optional(),`) with:
```ts
  sections: z.array(categorySchema).optional(),
```

Line 78 (`sellerStatus: z.enum(['seller', 'buyer']).optional(),`) → `sellerStatus: sellerStatusSchema.optional(),`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- schema.test.ts`
Expected: PASS — including the new out-of-enum rejection test.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/schema.ts src/lib/schema.test.ts
git commit -m "refactor: adopt @zebrooo/promo-schema for targeting validation"
```

---

## Task 6: `promo-cabinet` — closed multiselects for regions and sections

**Files:**
- Modify: `promo-cabinet/src/components/promo-form/sections/TargetingSection.tsx:38-41,79-86`

**Interfaces:**
- Consumes: `REGIONS`, `CATEGORIES` from `@/lib/schema` (re-exported in Task 5).

No automated test — this is a form-control swap in a JSX file with no existing component-level test harness in this section (confirmed: no `TargetingSection.test.tsx` exists). Verify manually per Task 8.

- [ ] **Step 1: Replace the regions `SlugListField` with a checkbox multiselect**

In `TargetingSection.tsx`, replace lines 38–41:
```tsx
        <div className="ef-field">
          <label>Регионы</label>
          <SlugListField name="targeting.regions" placeholder="sukhum, gagra" />
        </div>
```
with:
```tsx
        <div className="ef-field">
          <label>Регионы</label>
          <div className="ef-checkbox-row">
            {REGIONS.map((region) => (
              <label key={region} className="ef-checkbox">
                <input
                  type="checkbox"
                  checked={targeting.regions?.includes(region) ?? false}
                  onChange={(e) => {
                    const cur = targeting.regions ?? [];
                    const next = e.target.checked ? [...cur, region] : cur.filter((r) => r !== region);
                    setFieldValue('targeting.regions', next.length ? next : undefined);
                  }}
                />
                {region}
              </label>
            ))}
          </div>
        </div>
```

- [ ] **Step 2: Replace the sections `SlugListField` the same way, keep categories as free text**

Replace lines 79–90:
```tsx
        <div className="ef-field">
          <label>Разделы</label>
          <SlugListField name="sections" placeholder="avto, realty" />
          <span className="ef-hint">
            Работает только на overlay-поверхности; на topline/tooltip промо с разделами не показывается.
          </span>
        </div>
        <div className="ef-field">
          <label>Категории</label>
          <SlugListField name="categories" placeholder="kvartiry" />
        </div>
```
with:
```tsx
        <div className="ef-field">
          <label>Разделы</label>
          <div className="ef-checkbox-row">
            {CATEGORIES.map((cat) => (
              <label key={cat} className="ef-checkbox">
                <input
                  type="checkbox"
                  checked={values.sections?.includes(cat) ?? false}
                  onChange={(e) => {
                    const cur = values.sections ?? [];
                    const next = e.target.checked ? [...cur, cat] : cur.filter((c) => c !== cat);
                    setFieldValue('sections', next.length ? next : undefined);
                  }}
                />
                {cat}
              </label>
            ))}
          </div>
          <span className="ef-hint">
            Работает только на overlay-поверхности; на topline/tooltip промо с разделами не показывается.
          </span>
        </div>
        <div className="ef-field">
          <label>Категории</label>
          <SlugListField name="categories" placeholder="kvartiry" />
          <span className="ef-hint">
            Свободный текст: точная гранулярность (совпадает ли с сайтовым context.category) пока не
            подтверждена — закрытый список появится отдельным изменением.
          </span>
        </div>
```

- [ ] **Step 3: Add the import**

At the top of the file, change:
```tsx
import type { Promo } from '@/lib/schema';
```
to:
```tsx
import type { Promo } from '@/lib/schema';
import { REGIONS, CATEGORIES } from '@/lib/schema';
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/promo-form/sections/TargetingSection.tsx
git commit -m "feat: closed region/section pickers replace free-text targeting fields"
```

---

## Task 7: `promo-cabinet` — explicit `app` device-target pill

**Files:**
- Modify: `promo-cabinet/src/components/promo-form/sections/DevicePlacementSection.tsx:12-22,60-64`

- [ ] **Step 1: Update `allowedFormatsFor` to treat `app` like `touch` for format filtering**

Replace lines 12–22:
```tsx
function allowedFormatsFor(target: NonNullable<Promo['deviceTarget']>): readonly PromoFormat[] {
  const base = target === 'desktop' || target === 'both'
    ? FORMATS_BY_DEVICE.desktop
    : FORMATS_BY_DEVICE[target as DeviceClass];
  return [...new Set<PromoFormat>([...base, 'multistep', 'custom'])];
}
```
with:
```tsx
function allowedFormatsFor(target: NonNullable<Promo['deviceTarget']>): readonly PromoFormat[] {
  const deviceClass: DeviceClass = target === 'app' ? 'touch' : (target as DeviceClass);
  const base = target === 'desktop' || target === 'both'
    ? FORMATS_BY_DEVICE.desktop
    : FORMATS_BY_DEVICE[deviceClass];
  return [...new Set<PromoFormat>([...base, 'multistep', 'custom'])];
}
```

- [ ] **Step 2: Add the 4th pill**

Replace lines 60–64:
```tsx
          {([
            { v: 'both',    label: 'Везде',        sub: 'десктоп + мобиль' },
            { v: 'desktop', label: 'Только десктоп', sub: 'все форматы' },
            { v: 'touch',   label: 'Только мобиль',  sub: 'без topline' },
          ] as const).map((opt) => {
```
with:
```tsx
          {([
            { v: 'both',    label: 'Везде',            sub: 'десктоп + мобиль + приложение' },
            { v: 'desktop', label: 'Только десктоп',     sub: 'все форматы' },
            { v: 'touch',   label: 'Только мобиль',      sub: 'веб + приложение, без topline' },
            { v: 'app',     label: 'Только приложение',  sub: 'нативный WebView, без topline' },
          ] as const).map((opt) => {
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/promo-form/sections/DevicePlacementSection.tsx
git commit -m "feat: explicit app device-target pill in the cabinet"
```

---

## Task 8: Full-suite verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: `promo-schema` — build and test one more time**

Run: `cd /Users/dmitrii/projects/_services/promo-schema && npm test && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 2: `promo-bff` — full suite**

Run: `cd /Users/dmitrii/projects/_services/promo-bff && npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 3: `promo-cabinet` — full suite**

Run: `cd /Users/dmitrii/projects/_services/promo-cabinet && npm test && npm run typecheck`
Expected: all PASS.

- [ ] **Step 4: Manual QA — create a promo through the new UI**

Run `npm run dev` in `promo-cabinet`, log in, go to `/cabinet/new`:
1. Pick device target "Только приложение" — confirm topline/tooltip format tiles disappear (same as "Только мобиль" today).
2. Pick 2–3 regions from the new checkbox list (not free text) and 2–3 sections.
3. Save as draft, reopen it, confirm the same regions/sections are checked (round-trip through S3 works).
4. Confirm the "Категории" field is still free text with the new hint visible.

Expected: no console errors, saved promo's JSON in S3 (`GET /api/promos/<id>` or Studio-equivalent) shows `regions`/`sections` as arrays of the picked slugs and `deviceTarget: "app"`.

- [ ] **Step 5: Push both branches**

```bash
cd /Users/dmitrii/projects/_services/promo-bff && git push -u origin feat/promo-targeting-taxonomy
cd /Users/dmitrii/projects/_services/promo-cabinet && git push -u origin feat/promo-targeting-taxonomy
```

- [ ] **Step 6: Open PRs**

```bash
cd /Users/dmitrii/projects/_services/promo-bff && gh pr create --base main --title "feat: shared targeting schema + explicit app device target" --body "Part of the promo audience-targeting series. Adopts @zebrooo/promo-schema; adds explicit app deviceTarget alongside desktop/touch/both, backward-compatible with existing touch-targeted promos."
cd /Users/dmitrii/projects/_services/promo-cabinet && gh pr create --base main --title "feat: closed region/section pickers + app device pill" --body "Part of the promo audience-targeting series. Adopts @zebrooo/promo-schema; regions/sections are now closed multiselects instead of free text; categories stays free text pending confirmation of context.category granularity; adds the app device-target pill."
```
