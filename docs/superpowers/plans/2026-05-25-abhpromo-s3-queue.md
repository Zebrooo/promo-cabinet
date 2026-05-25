# abhPromo: S3 catalogue + queue selection + cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch abhPromo (our BFF) from a hardcoded promo array + score-based selection to reading an **ordered** catalogue from S3 and selecting the **first eligible promo in queue order**, with boolean checkers and a new cooldown rule.

**Architecture:** abhPromo stays a Fastify selection service. `config-service` reads `catalogue.json` from S3 (via `@aws-sdk/client-s3`, fresh per request, zod-validated). The checker chain becomes an array of pure `(userData, promo, config) => boolean` functions evaluated in order; `selectPromo` returns the first promo where every checker passes, else `null`. Scoring (`baseScore`/`ScoreChecker`/`minScore`/`checker-config.json`) is removed; a `CooldownChecker` and per-user `lastShownAt` are added. abhPromo aggregates `UserData` from its own services (`userService` is DataSync-backed).

**Tech Stack:** TypeScript (ESM), Fastify 5, Vitest 3 (esbuild — runs without type-checking; `tsc --noEmit` is the final gate), zod, `@aws-sdk/client-s3`, `aws-sdk-client-mock`.

**Repo:** `c:\Users\Yarrrr\Desktop\abhPromo` (existing). Run all commands from that directory.

---

## File Structure

- **Modify** `src/promo-selector/types.ts` — `Checker` returns `boolean`; remove `CheckResult`; `Promo` drops `baseScore`, gains `cooldownHours`; `UserData` drops `scoreMultiplier`, gains `lastShownAt`; `CheckerConfig` is `{ now }`.
- **Modify** `src/test-utils.ts` — builders for the new shapes.
- **Modify** `src/promo-selector/checkers/date-checker.ts`, `user-checker.ts`, `limit-checker.ts` (+ their tests) — return `boolean`.
- **Create** `src/promo-selector/checkers/cooldown-checker.ts` (+ test) — new rule.
- **Delete** `src/promo-selector/checkers/score-checker.ts` (+ test).
- **Modify** `src/promo-selector/index.ts` (+ test) — boolean checker array, return `Promo | null`, drop `rejected`.
- **Create** `src/services/catalogue-schema.ts` — zod `promoSchema` / `catalogueSchema` (validation source of truth).
- **Create** `src/services/s3-client.ts` — memoized `S3Client` + key helper.
- **Modify** `src/config.ts` — add `s3` config block.
- **Modify** `src/services/config-service.ts` (+ create test) — S3 GetObject → zod parse; `getPromos` only.
- **Modify** `src/services/user-service.ts` — `UserProfile` gains `lastShownAt`, drops `scoreMultiplier`.
- **Modify** `src/models/select-promo/handle.ts` (+ test) — drop `getCheckerConfig`, build `UserData.lastShownAt`, call `selectPromo(promos, userData, { now })`, drop rejected log.
- **Modify** `src/server.test.ts` — inject a fake `configService` (real one now hits S3).
- **Create** `scripts/seed-catalogue.ts` — upload an initial ordered catalogue.

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install runtime + dev dependencies**

Run:
```bash
npm install zod@^3.23.0 @aws-sdk/client-s3@^3.600.0
npm install -D aws-sdk-client-mock@^4.0.0
```
Expected: both complete; `package.json` now lists `zod` and `@aws-sdk/client-s3` under `dependencies`, `aws-sdk-client-mock` under `devDependencies`.

- [ ] **Step 2: Verify the test suite still runs (baseline, green)**

Run: `npm test`
Expected: PASS — all existing tests still green (no source changed yet).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod, @aws-sdk/client-s3, aws-sdk-client-mock"
```

---

## Task 2: Rework domain types + test builders

This is the foundational type change. Vitest transpiles without type-checking, so the suite keeps running on old checker bodies until later tasks convert them; `tsc` is the final gate (Task 11).

**Files:**
- Modify: `src/promo-selector/types.ts`
- Modify: `src/test-utils.ts`

- [ ] **Step 1: Rewrite `src/promo-selector/types.ts`**

```ts
/** Domain types for promo selection. */

export type SubscriptionLevel = 'none' | 'plus' | 'premium';

export type PromoFormat = 'inline' | 'popup' | 'fullscreen';

export interface PromoTargeting {
  minAge?: number;
  maxAge?: number;
  /** Allowed regions; empty/omitted means "all regions". */
  regions?: string[];
  /** Allowed subscription levels; empty/omitted means "any level". */
  subscriptionLevels?: SubscriptionLevel[];
}

/**
 * A promo as stored in the S3 catalogue. Array order in catalogue.json is the
 * queue order; a promo carries its own targeting, show window, per-user impression
 * cap and cooldown. Each checker reads only the fields it owns.
 */
export interface Promo {
  id: string;
  name: string;
  /** Show window, ISO-8601 timestamps. */
  startsAt: string;
  endsAt: string;
  targeting: PromoTargeting;
  /** Max times one user may see this promo. 0 (or less) = unlimited. */
  maxImpressionsPerUser: number;
  /** Minimum hours between two shows to the same user. 0 = no cooldown. */
  cooldownHours: number;
  /** Display format for the renderer. */
  format: PromoFormat;
  /** User-facing headline. */
  title: string;
  description?: string;
  imageUrl?: string;
  /** CTA: deep link/route + optional label. */
  action?: { href: string; label?: string };
  /** Overlays: whether the user can dismiss it (default true). */
  dismissible?: boolean;
}

/** Everything the checkers need to know about the user, aggregated from services. */
export interface UserData {
  userId: string;
  age: number;
  region: string;
  subscriptionLevel: SubscriptionLevel;
  /** promoId -> how many times this user has already seen it. */
  impressionCounts: Record<string, number>;
  /** promoId -> ISO-8601 timestamp of the last time this user saw it (DataSync). */
  lastShownAt: Record<string, string>;
}

export interface CheckerConfig {
  /** Injected "current time" so date/cooldown checks are deterministic in tests. */
  now: Date;
}

/**
 * A checker is a pure predicate of (userData, promo, config): true = the promo may
 * be shown, false = skip this promo. Pure + isolated = trivially unit-testable.
 */
export type Checker = (userData: UserData, promo: Promo, config: CheckerConfig) => boolean;
```

- [ ] **Step 2: Rewrite `src/test-utils.ts`**

```ts
/** Test-only builders. Keep defaults "valid" so each test overrides just one field. */
import type { CheckerConfig, Promo, UserData } from './promo-selector/types';

export function makePromo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: 'promo-1',
    name: 'Test Promo',
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2100-01-01T00:00:00.000Z',
    targeting: {},
    maxImpressionsPerUser: 0,
    cooldownHours: 0,
    format: 'inline',
    title: 'Test Promo',
    ...overrides,
  };
}

export function makeUserData(overrides: Partial<UserData> = {}): UserData {
  return {
    userId: 'user-1',
    age: 30,
    region: 'ru',
    subscriptionLevel: 'plus',
    impressionCounts: {},
    lastShownAt: {},
    ...overrides,
  };
}

export function makeCheckerConfig(overrides: Partial<CheckerConfig> = {}): CheckerConfig {
  return {
    now: new Date('2024-06-01T12:00:00.000Z'),
    ...overrides,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/promo-selector/types.ts src/test-utils.ts
git commit -m "refactor: boolean Checker, cooldownHours/lastShownAt, drop scoring types"
```

---

## Task 3: Convert DateChecker to boolean

**Files:**
- Modify: `src/promo-selector/checkers/date-checker.test.ts`
- Modify: `src/promo-selector/checkers/date-checker.ts`

- [ ] **Step 1: Rewrite the test to expect booleans**

Replace the whole body of `src/promo-selector/checkers/date-checker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dateChecker } from './date-checker';
import { makeCheckerConfig, makePromo, makeUserData } from '../../test-utils';

const user = makeUserData();
const at = (iso: string) => makeCheckerConfig({ now: new Date(iso) });

describe('dateChecker', () => {
  it('passes inside the [startsAt, endsAt] window', () => {
    const promo = makePromo({ startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z' });
    expect(dateChecker(user, promo, at('2024-06-01T00:00:00.000Z'))).toBe(true);
  });

  it('fails before startsAt', () => {
    const promo = makePromo({ startsAt: '2024-06-01T00:00:00.000Z', endsAt: '2024-12-31T00:00:00.000Z' });
    expect(dateChecker(user, promo, at('2024-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('fails after endsAt', () => {
    const promo = makePromo({ startsAt: '2024-01-01T00:00:00.000Z', endsAt: '2024-03-01T00:00:00.000Z' });
    expect(dateChecker(user, promo, at('2024-06-01T00:00:00.000Z'))).toBe(false);
  });

  it('fails on an unparseable date range', () => {
    const promo = makePromo({ startsAt: 'not-a-date', endsAt: 'also-bad' });
    expect(dateChecker(user, promo, at('2024-06-01T00:00:00.000Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/promo-selector/checkers/date-checker.test.ts`
Expected: FAIL — current impl returns `{ ok: true }` objects, so `toBe(true)` fails.

- [ ] **Step 3: Rewrite `src/promo-selector/checkers/date-checker.ts`**

```ts
import type { Checker } from '../types';

/** A promo may only be shown within its [startsAt, endsAt] window. */
export const dateChecker: Checker = (_userData, promo, config) => {
  const now = config.now.getTime();
  const start = new Date(promo.startsAt).getTime();
  const end = new Date(promo.endsAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  if (now < start) return false;
  if (now > end) return false;
  return true;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/promo-selector/checkers/date-checker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/promo-selector/checkers/date-checker.ts src/promo-selector/checkers/date-checker.test.ts
git commit -m "refactor: dateChecker returns boolean"
```

---

## Task 4: Convert UserChecker to boolean

**Files:**
- Modify: `src/promo-selector/checkers/user-checker.test.ts`
- Modify: `src/promo-selector/checkers/user-checker.ts`

- [ ] **Step 1: Rewrite the test**

Replace the whole body of `src/promo-selector/checkers/user-checker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { userChecker } from './user-checker';
import { makeCheckerConfig, makePromo, makeUserData } from '../../test-utils';

const config = makeCheckerConfig();

describe('userChecker', () => {
  it('passes when no targeting is set', () => {
    expect(userChecker(makeUserData(), makePromo({ targeting: {} }), config)).toBe(true);
  });

  it('fails below minAge', () => {
    const promo = makePromo({ targeting: { minAge: 18 } });
    expect(userChecker(makeUserData({ age: 16 }), promo, config)).toBe(false);
  });

  it('fails above maxAge', () => {
    const promo = makePromo({ targeting: { maxAge: 40 } });
    expect(userChecker(makeUserData({ age: 50 }), promo, config)).toBe(false);
  });

  it('fails when the region is not targeted', () => {
    const promo = makePromo({ targeting: { regions: ['by'] } });
    expect(userChecker(makeUserData({ region: 'ru' }), promo, config)).toBe(false);
  });

  it('passes when the region is targeted', () => {
    const promo = makePromo({ targeting: { regions: ['ru', 'by'] } });
    expect(userChecker(makeUserData({ region: 'ru' }), promo, config)).toBe(true);
  });

  it('fails when the subscription level is not targeted', () => {
    const promo = makePromo({ targeting: { subscriptionLevels: ['premium'] } });
    expect(userChecker(makeUserData({ subscriptionLevel: 'plus' }), promo, config)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/promo-selector/checkers/user-checker.test.ts`
Expected: FAIL — impl still returns objects.

- [ ] **Step 3: Rewrite `src/promo-selector/checkers/user-checker.ts`**

```ts
import type { Checker } from '../types';

/** The user must fall within the promo's target audience (age / region / subscription). */
export const userChecker: Checker = (userData, promo, _config) => {
  const { targeting } = promo;

  if (targeting.minAge !== undefined && userData.age < targeting.minAge) return false;
  if (targeting.maxAge !== undefined && userData.age > targeting.maxAge) return false;
  if (targeting.regions?.length && !targeting.regions.includes(userData.region)) return false;
  if (
    targeting.subscriptionLevels?.length &&
    !targeting.subscriptionLevels.includes(userData.subscriptionLevel)
  ) {
    return false;
  }
  return true;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/promo-selector/checkers/user-checker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/promo-selector/checkers/user-checker.ts src/promo-selector/checkers/user-checker.test.ts
git commit -m "refactor: userChecker returns boolean"
```

---

## Task 5: Convert LimitChecker to boolean

**Files:**
- Modify: `src/promo-selector/checkers/limit-checker.test.ts`
- Modify: `src/promo-selector/checkers/limit-checker.ts`

- [ ] **Step 1: Rewrite the test**

Replace the whole body of `src/promo-selector/checkers/limit-checker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { limitChecker } from './limit-checker';
import { makeCheckerConfig, makePromo, makeUserData } from '../../test-utils';

const config = makeCheckerConfig();

describe('limitChecker', () => {
  it('passes when maxImpressionsPerUser is 0 (unlimited)', () => {
    const promo = makePromo({ id: 'p', maxImpressionsPerUser: 0 });
    const user = makeUserData({ impressionCounts: { p: 999 } });
    expect(limitChecker(user, promo, config)).toBe(true);
  });

  it('passes when the user is below the cap', () => {
    const promo = makePromo({ id: 'p', maxImpressionsPerUser: 3 });
    const user = makeUserData({ impressionCounts: { p: 2 } });
    expect(limitChecker(user, promo, config)).toBe(true);
  });

  it('fails when the user has reached the cap', () => {
    const promo = makePromo({ id: 'p', maxImpressionsPerUser: 3 });
    const user = makeUserData({ impressionCounts: { p: 3 } });
    expect(limitChecker(user, promo, config)).toBe(false);
  });

  it('treats a missing count as 0', () => {
    const promo = makePromo({ id: 'p', maxImpressionsPerUser: 1 });
    expect(limitChecker(makeUserData(), promo, config)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/promo-selector/checkers/limit-checker.test.ts`
Expected: FAIL — impl still returns objects.

- [ ] **Step 3: Rewrite `src/promo-selector/checkers/limit-checker.ts`**

```ts
import type { Checker } from '../types';

/**
 * Rejects a promo once the user has already seen it maxImpressionsPerUser times.
 *
 * RACE CONDITION (read-modify-write): two near-simultaneous requests from the same
 * user both read the same impressionCounts here and both pass. This checker only
 * READS the count, so it is a cheap pre-filter, not the source of truth. The real
 * guard is an atomic conditional increment in the impression-history storage at the
 * moment the impression is recorded (see userService.recordImpression).
 */
export const limitChecker: Checker = (userData, promo, _config) => {
  if (promo.maxImpressionsPerUser <= 0) return true; // 0 / negative = unlimited
  const seen = userData.impressionCounts[promo.id] ?? 0;
  return seen < promo.maxImpressionsPerUser;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/promo-selector/checkers/limit-checker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/promo-selector/checkers/limit-checker.ts src/promo-selector/checkers/limit-checker.test.ts
git commit -m "refactor: limitChecker returns boolean"
```

---

## Task 6: Add CooldownChecker

**Files:**
- Create: `src/promo-selector/checkers/cooldown-checker.test.ts`
- Create: `src/promo-selector/checkers/cooldown-checker.ts`

- [ ] **Step 1: Write the failing test**

Create `src/promo-selector/checkers/cooldown-checker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cooldownChecker } from './cooldown-checker';
import { makeCheckerConfig, makePromo, makeUserData } from '../../test-utils';

const now = new Date('2024-06-01T12:00:00.000Z');
const config = makeCheckerConfig({ now });

describe('cooldownChecker', () => {
  it('passes when cooldownHours is 0 (no cooldown)', () => {
    const promo = makePromo({ id: 'p', cooldownHours: 0 });
    const user = makeUserData({ lastShownAt: { p: '2024-06-01T11:59:00.000Z' } });
    expect(cooldownChecker(user, promo, config)).toBe(true);
  });

  it('passes when the user has never seen the promo', () => {
    const promo = makePromo({ id: 'p', cooldownHours: 24 });
    expect(cooldownChecker(makeUserData(), promo, config)).toBe(true);
  });

  it('fails when the last show is within the cooldown window', () => {
    const promo = makePromo({ id: 'p', cooldownHours: 24 });
    // shown 1 hour ago, cooldown is 24h -> still cooling down
    const user = makeUserData({ lastShownAt: { p: '2024-06-01T11:00:00.000Z' } });
    expect(cooldownChecker(user, promo, config)).toBe(false);
  });

  it('passes when the cooldown window has fully elapsed', () => {
    const promo = makePromo({ id: 'p', cooldownHours: 24 });
    // shown 25 hours ago, cooldown is 24h -> eligible again
    const user = makeUserData({ lastShownAt: { p: '2024-05-31T11:00:00.000Z' } });
    expect(cooldownChecker(user, promo, config)).toBe(true);
  });

  it('passes (treats as never-shown) when the stored timestamp is unparseable', () => {
    const promo = makePromo({ id: 'p', cooldownHours: 24 });
    const user = makeUserData({ lastShownAt: { p: 'not-a-date' } });
    expect(cooldownChecker(user, promo, config)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/promo-selector/checkers/cooldown-checker.test.ts`
Expected: FAIL with "cooldownChecker is not defined / module not found".

- [ ] **Step 3: Write `src/promo-selector/checkers/cooldown-checker.ts`**

```ts
import type { Checker } from '../types';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Limits how often one user sees a promo. Eligible iff cooldown is disabled, the
 * user has never seen it, or at least `cooldownHours` have elapsed since the last
 * show (`lastShownAt`, supplied per-user from DataSync). An unparseable/missing
 * timestamp is treated as "never shown" (eligible).
 */
export const cooldownChecker: Checker = (userData, promo, config) => {
  if (promo.cooldownHours <= 0) return true;
  const last = userData.lastShownAt[promo.id];
  if (!last) return true;
  const lastMs = new Date(last).getTime();
  if (Number.isNaN(lastMs)) return true;
  const elapsedMs = config.now.getTime() - lastMs;
  return elapsedMs >= promo.cooldownHours * MS_PER_HOUR;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/promo-selector/checkers/cooldown-checker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/promo-selector/checkers/cooldown-checker.ts src/promo-selector/checkers/cooldown-checker.test.ts
git commit -m "feat: add cooldownChecker (per-user lastShownAt + cooldownHours)"
```

---

## Task 7: Remove ScoreChecker

**Files:**
- Delete: `src/promo-selector/checkers/score-checker.ts`
- Delete: `src/promo-selector/checkers/score-checker.test.ts`

- [ ] **Step 1: Delete the score checker and its test**

Run:
```bash
git rm src/promo-selector/checkers/score-checker.ts src/promo-selector/checkers/score-checker.test.ts
```
Expected: both files removed. (The selector still imports `scoreChecker` in `index.ts`; that import is fixed in Task 8, so do not run the full suite between Task 7 and Task 8.)

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor: remove scoreChecker (scoring dropped for queue ordering)"
```

---

## Task 8: Rewrite selectPromo (boolean array, first-eligible, no rejected)

**Files:**
- Modify: `src/promo-selector/index.test.ts`
- Modify: `src/promo-selector/index.ts`

- [ ] **Step 1: Rewrite the test**

Replace the whole body of `src/promo-selector/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { selectPromo } from './index';
import type { Checker } from './types';
import { makeCheckerConfig, makePromo, makeUserData } from '../test-utils';

const user = makeUserData();
const config = makeCheckerConfig();

const pass: Checker = () => true;
const fail: Checker = () => false;

describe('selectPromo', () => {
  it('returns the first promo when every checker passes', () => {
    const promos = [makePromo({ id: 'a' }), makePromo({ id: 'b' }), makePromo({ id: 'c' })];
    expect(selectPromo(promos, user, config, [pass, pass])?.id).toBe('a');
  });

  it('skips promos that fail a checker and returns the first fully-passing one', () => {
    const rejectFirst: Checker = (_u, promo) => promo.id !== 'a';
    const promos = [makePromo({ id: 'a' }), makePromo({ id: 'b' })];
    expect(selectPromo(promos, user, config, [pass, rejectFirst])?.id).toBe('b');
  });

  it('honours queue (array) order, not any score', () => {
    const promos = [makePromo({ id: 'first' }), makePromo({ id: 'second' })];
    expect(selectPromo(promos, user, config, [pass])?.id).toBe('first');
  });

  it('short-circuits: checkers after the first failure are not called', () => {
    const first = vi.fn<Checker>(() => false);
    const second = vi.fn<Checker>(() => true);
    const result = selectPromo([makePromo({ id: 'a' })], user, config, [first, second]);
    expect(result).toBeNull();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('returns null when no promo passes', () => {
    const promos = [makePromo({ id: 'a' }), makePromo({ id: 'b' })];
    expect(selectPromo(promos, user, config, [fail])).toBeNull();
  });

  it('returns null on an empty promo list', () => {
    expect(selectPromo([], user, config)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/promo-selector/index.test.ts`
Expected: FAIL — `selectPromo` still returns `{ promo, rejected }` and imports the deleted `scoreChecker`.

- [ ] **Step 3: Rewrite `src/promo-selector/index.ts`**

```ts
import type { Checker, CheckerConfig, Promo, UserData } from './types';
import { dateChecker } from './checkers/date-checker';
import { userChecker } from './checkers/user-checker';
import { limitChecker } from './checkers/limit-checker';
import { cooldownChecker } from './checkers/cooldown-checker';

/**
 * Checker array, ordered cheap -> expensive: date < audience < impression-limit <
 * cooldown. Add or reorder rules by editing this array. Each checker is a pure
 * predicate returning true (may show) / false (skip this promo).
 */
export const defaultCheckers: Checker[] = [dateChecker, userChecker, limitChecker, cooldownChecker];

/**
 * Walks the catalogue in queue (array) order and returns the FIRST promo for which
 * every checker returns true, or null if none qualify. `.every()` runs the checkers
 * lazily and short-circuits on the first false, so later (costlier) checkers are not
 * called for a rejected promo.
 */
export function selectPromo(
  promos: Promo[],
  userData: UserData,
  config: CheckerConfig,
  checkers: Checker[] = defaultCheckers,
): Promo | null {
  for (const promo of promos) {
    if (checkers.every((check) => check(userData, promo, config))) return promo;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/promo-selector/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/promo-selector/index.ts src/promo-selector/index.test.ts
git commit -m "refactor: selectPromo walks queue order, returns first eligible promo"
```

---

## Task 9: Add the catalogue zod schema

**Files:**
- Create: `src/services/catalogue-schema.test.ts`
- Create: `src/services/catalogue-schema.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/catalogue-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueSchema, promoSchema } from './catalogue-schema';
import { makePromo } from '../test-utils';

describe('promoSchema', () => {
  it('accepts a fully-valid promo', () => {
    expect(() => promoSchema.parse(makePromo())).not.toThrow();
  });

  it('rejects a negative cooldownHours', () => {
    expect(() => promoSchema.parse(makePromo({ cooldownHours: -1 }))).toThrow();
  });

  it('rejects a non-ISO startsAt', () => {
    expect(() => promoSchema.parse(makePromo({ startsAt: 'yesterday' }))).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => promoSchema.parse(makePromo({ format: 'banner' as never }))).toThrow();
  });

  it('rejects a promo missing required fields', () => {
    expect(() => promoSchema.parse({ id: 'x' })).toThrow();
  });
});

describe('catalogueSchema', () => {
  it('accepts an ordered array of promos and preserves order', () => {
    const parsed = catalogueSchema.parse([makePromo({ id: 'a' }), makePromo({ id: 'b' })]);
    expect(parsed.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('rejects a non-array', () => {
    expect(() => catalogueSchema.parse({ id: 'a' })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/services/catalogue-schema.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write `src/services/catalogue-schema.ts`**

```ts
import { z } from 'zod';
import type { Promo } from '../promo-selector/types';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen']);

/** Validation source of truth for a promo (mirrored by the cabinet). */
export const promoSchema = z.object({
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
});

export const catalogueSchema = z.array(promoSchema);

// Compile-time guard: a parsed promo must satisfy the Promo domain type. If the
// schema drifts from `Promo`, this assignment fails `tsc --noEmit`.
type SchemaPromo = z.infer<typeof promoSchema>;
const _schemaMatchesDomain: (p: SchemaPromo) => Promo = (p) => p;
void _schemaMatchesDomain;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/services/catalogue-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/catalogue-schema.ts src/services/catalogue-schema.test.ts
git commit -m "feat: add zod catalogue/promo schema (validation source of truth)"
```

---

## Task 10: S3 client, config, and S3-backed config-service

**Files:**
- Create: `src/services/s3-client.ts`
- Modify: `src/config.ts`
- Modify: `src/services/config-service.ts`
- Create: `src/services/config-service.test.ts`

- [ ] **Step 1: Add the S3 config block to `src/config.ts`**

Replace the file contents with:

```ts
/**
 * App configuration. Timeouts for external services and S3 catalogue settings live
 * here so they can be tuned without touching the service clients.
 */

export interface ServiceTimeouts {
  configServiceMs: number;
  userServiceMs: number;
  billingServiceMs: number;
}

export interface S3Config {
  /** Bucket holding catalogue.json. Empty until the user provisions it. */
  bucket: string;
  region: string;
  /** Optional key prefix (e.g. "promos/"). Empty = bucket root. */
  keyPrefix: string;
}

export interface AppConfig {
  port: number;
  host: string;
  serviceTimeouts: ServiceTimeouts;
  s3: S3Config;
}

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  serviceTimeouts: {
    configServiceMs: Number(process.env.CONFIG_TIMEOUT_MS ?? 2500),
    userServiceMs: Number(process.env.USER_TIMEOUT_MS ?? 2500),
    billingServiceMs: Number(process.env.BILLING_TIMEOUT_MS ?? 2500),
  },
  s3: {
    bucket: process.env.PROMO_BUCKET ?? '',
    region: process.env.AWS_REGION ?? 'us-east-1',
    keyPrefix: process.env.PROMO_KEY_PREFIX ?? '',
  },
};
```

- [ ] **Step 2: Create `src/services/s3-client.ts`**

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { config } from '../config';

let client: S3Client | null = null;

/** Lazily-constructed singleton S3 client. Creds come via the standard AWS SDK chain. */
export function getS3Client(): S3Client {
  if (!client) client = new S3Client({ region: config.s3.region });
  return client;
}

/** Catalogue object key, honouring the optional key prefix. */
export function catalogueKey(): string {
  return `${config.s3.keyPrefix}catalogue.json`;
}

/** Test seam: drop the memoized client so a fresh one is built next call. */
export function resetS3ClientForTests(): void {
  client = null;
}
```

- [ ] **Step 3: Write the failing config-service test**

Create `src/services/config-service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createConfigService } from './config-service';
import { resetS3ClientForTests } from './s3-client';
import { makePromo } from '../test-utils';

const s3Mock = mockClient(S3Client);

/** aws-sdk-client-mock returns whatever we resolve; a Body with transformToString is enough. */
const body = (text: string) => ({ transformToString: async () => text }) as never;

beforeEach(() => {
  s3Mock.reset();
  resetS3ClientForTests();
});
afterEach(() => {
  s3Mock.reset();
});

describe('configService.getPromos', () => {
  it('reads catalogue.json from S3 and returns the ordered promos', async () => {
    const promos = [makePromo({ id: 'a' }), makePromo({ id: 'b' })];
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify(promos)) });

    const result = await createConfigService().getPromos();
    expect(result.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('throws on malformed JSON', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body('{not json') });
    await expect(createConfigService().getPromos()).rejects.toThrow();
  });

  it('throws on schema-invalid catalogue', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: body(JSON.stringify([{ id: 'x' }])) });
    await expect(createConfigService().getPromos()).rejects.toThrow();
  });

  it('throws when S3 errors', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('NoSuchKey'));
    await expect(createConfigService().getPromos()).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/services/config-service.test.ts`
Expected: FAIL — current `config-service.ts` still exports `getCheckerConfig` / `MOCK_PROMOS` and does not call S3.

- [ ] **Step 5: Rewrite `src/services/config-service.ts`**

```ts
/**
 * Config service — reads the promo catalogue from S3 (catalogue.json).
 *
 * Fresh GET per request (no cache): edits in the cabinet take effect immediately and
 * a few RPS over S3 is fine. The JSON is defensively zod-validated, so a corrupt
 * catalogue throws (→ handled as an "error" envelope) rather than crashing.
 */
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { Promo } from '../promo-selector/types';
import { config } from '../config';
import { withTimeout } from '../util/with-timeout';
import { catalogueKey, getS3Client } from './s3-client';
import { catalogueSchema } from './catalogue-schema';

export interface ConfigService {
  /** All promos, in queue order (first match wins downstream). */
  getPromos(): Promise<Promo[]>;
}

async function fetchPromos(): Promise<Promo[]> {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: catalogueKey() }),
  );
  if (!res.Body) throw new Error('configService.getPromos: empty S3 body');
  const text = await res.Body.transformToString();
  return catalogueSchema.parse(JSON.parse(text));
}

export function createConfigService(): ConfigService {
  const ms = config.serviceTimeouts.configServiceMs;
  return {
    getPromos: () => withTimeout(fetchPromos(), ms, 'configService.getPromos'),
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/services/config-service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/services/s3-client.ts src/services/config-service.ts src/services/config-service.test.ts
git commit -m "feat: config-service reads catalogue.json from S3 (zod-validated)"
```

---

## Task 11: Wire lastShownAt through userService + handle, fix server tests

**Files:**
- Modify: `src/services/user-service.ts`
- Modify: `src/models/select-promo/handle.ts`
- Modify: `src/models/select-promo/handle.test.ts`
- Modify: `src/server.test.ts`

- [ ] **Step 1: Update `src/services/user-service.ts`**

Replace `UserProfile`, `fetchUserProfile`, and the doc comment so the profile carries
`lastShownAt` and no longer carries `scoreMultiplier`:

```ts
/**
 * User data client — profile + impression history + last-shown timestamps
 * (Blackbox identity + DataSync history). STUB: returns in-memory mock data.
 */
import { config } from '../config';
import { withTimeout } from '../util/with-timeout';

export interface UserProfile {
  userId: string;
  age: number;
  region: string;
  /** promoId -> times this user has already seen it (impression history). */
  impressionCounts: Record<string, number>;
  /** promoId -> ISO-8601 timestamp of the last show (DataSync); drives cooldown. */
  lastShownAt: Record<string, string>;
}

export interface UserService {
  getUserProfile(userId: string): Promise<UserProfile>;
  /** Records that the user was shown a promo. See the race-condition note below. */
  recordImpression(userId: string, promoId: string): Promise<void>;
}

async function fetchUserProfile(userId: string): Promise<UserProfile> {
  // Mock: a typical eligible user with no prior impressions.
  return {
    userId,
    age: 30,
    region: 'ru',
    impressionCounts: {},
    lastShownAt: {},
  };
}
```

Keep the existing `recordImpressionImpl` (with its race-condition TODO comment) and the
`createUserService` factory exactly as they are.

- [ ] **Step 2: Update the user-data assembly in `src/models/select-promo/handle.ts`**

In the config-load block, drop `getCheckerConfig`:

```ts
  // 1. Load the promo catalogue from S3.
  let promos;
  try {
    promos = await configService.getPromos();
  } catch (err) {
    logger?.error({ err }, 'select-promo: config service unavailable');
    return { status: 'error', reason: 'config_service_unavailable' };
  }
```

Replace the `userData` construction with one that includes `lastShownAt` and drops
`scoreMultiplier`:

```ts
  const userData: UserData = {
    userId: params.userId,
    age: profile.age,
    region: profile.region,
    subscriptionLevel: subscription.level,
    impressionCounts: profile.impressionCounts,
    lastShownAt: profile.lastShownAt,
  };
```

Replace the selection block (which destructured `{ promo, rejected }` and logged
rejections) with the new `Promo | null` API:

```ts
  // 3 + 4. Walk the queue in order; take the first promo that passes every checker.
  const promo = selectPromo(promos, userData, { now });

  if (!promo) {
    return { status: 'skipped', reason: 'no_promo' };
  }
```

Leave the `recordImpression` best-effort block and the final `ok` mapping unchanged.

- [ ] **Step 3: Update `src/models/select-promo/handle.test.ts`**

The fakes referenced `getCheckerConfig`, `scoreMultiplier`, and `baseScore`. Update the
three fake builders and the two affected cases:

Replace `fakeConfigService`:

```ts
const fakeConfigService = (over: Partial<ConfigService> = {}): ConfigService => ({
  getPromos: async () => [makePromo()], // default promo passes every checker
  ...over,
});
```

Replace `fakeUserService`:

```ts
const fakeUserService = (over: Partial<UserService> = {}): UserService => ({
  getUserProfile: async (userId) => ({
    userId,
    age: 30,
    region: 'ru',
    impressionCounts: {},
    lastShownAt: {},
  }),
  recordImpression: async () => {},
  ...over,
});
```

Replace the "skipped when nothing passes" case (it relied on `baseScore`) with one that
fails the date window instead:

```ts
  it('returns status "skipped" with reason no_promo when nothing passes', async () => {
    const configService = fakeConfigService({
      // Expired window -> dateChecker fails -> no promo qualifies.
      getPromos: async () => [makePromo({ endsAt: '2000-01-01T00:00:00.000Z' })],
    });
    const result = await handleSelectPromo({ userId: 'u1' }, deps({ configService }));
    expect(result).toEqual({ status: 'skipped', reason: 'no_promo' });
  });
```

All other cases stay as-is.

- [ ] **Step 4: Update `src/server.test.ts`**

The real `configService` now reads S3, so the success case must inject a fake. At the top,
after the imports, add a helper and an `okDeps`:

```ts
import { makePromo } from './test-utils';

const fakeConfig = (promos = [makePromo({
  id: 'summer-sale',
  format: 'popup' as const,
  title: 'Летняя распродажа −30%',
  description: 'Скидки до 30% на весь каталог до конца лета.',
  imageUrl: 'https://cdn.example.com/promo/summer-sale.png',
  action: { href: '/sale/summer', label: 'Подробнее' },
  dismissible: true,
})]): { configService: ConfigService } => ({
  configService: { getPromos: async () => promos },
});
```

Change the "200 with an ok envelope" case to build the server with that fake:

```ts
  it('returns 200 with an ok envelope for a valid request', async () => {
    const app = buildServer({ logger: false, deps: fakeConfig() });
    const res = await post(app, {
      models: ['select-promo'],
      params: { userId: 'user123', context: { platform: 'web', locale: 'ru' } },
    });
    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({
      'select-promo': {
        status: 'ok',
        data: {
          id: 'summer-sale',
          format: 'popup',
          title: 'Летняя распродажа −30%',
          description: 'Скидки до 30% на весь каталог до конца лета.',
          imageUrl: 'https://cdn.example.com/promo/summer-sale.png',
          action: { href: '/sale/summer', label: 'Подробнее' },
          dismissible: true,
        },
      },
    });
    await app.close();
  });
```

In the "error envelope when a dependency fails" case, drop the now-nonexistent
`getCheckerConfig` from the inline `brokenConfig`:

```ts
    const brokenConfig: ConfigService = {
      getPromos: async () => {
        throw new Error('bunker unreachable');
      },
    };
```

- [ ] **Step 5: Run the affected suites to verify they pass**

Run: `npx vitest run src/models/select-promo/handle.test.ts src/server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/user-service.ts src/models/select-promo/handle.ts src/models/select-promo/handle.test.ts src/server.test.ts
git commit -m "feat: thread lastShownAt through userService + handle; drop checker-config/score from handler"
```

---

## Task 12: Seed script

**Files:**
- Create: `scripts/seed-catalogue.ts`

- [ ] **Step 1: Create `scripts/seed-catalogue.ts`**

```ts
/**
 * Seeds catalogue.json into the configured S3 bucket so there is data once a bucket
 * exists. Run manually: `npx tsx scripts/seed-catalogue.ts`. Requires PROMO_BUCKET,
 * AWS_REGION (+ optional PROMO_KEY_PREFIX) and AWS creds in the environment.
 */
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../src/config';
import { catalogueKey, getS3Client } from '../src/services/s3-client';
import { catalogueSchema } from '../src/services/catalogue-schema';
import type { Promo } from '../src/promo-selector/types';

const seed: Promo[] = [
  {
    id: 'premium-deal',
    name: 'Premium Members Deal',
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2100-01-01T00:00:00.000Z',
    targeting: { subscriptionLevels: ['premium'] },
    maxImpressionsPerUser: 0,
    cooldownHours: 0,
    format: 'fullscreen',
    title: 'Эксклюзив для Premium',
    description: 'Специальные условия для подписчиков Premium.',
    imageUrl: 'https://cdn.example.com/promo/premium-deal.png',
    action: { href: '/premium/deal' },
    dismissible: true,
  },
  {
    id: 'summer-sale',
    name: 'Summer Sale -30%',
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2100-01-01T00:00:00.000Z',
    targeting: { minAge: 18, regions: ['ru', 'by'], subscriptionLevels: ['plus', 'premium'] },
    maxImpressionsPerUser: 3,
    cooldownHours: 24,
    format: 'popup',
    title: 'Летняя распродажа −30%',
    description: 'Скидки до 30% на весь каталог до конца лета.',
    imageUrl: 'https://cdn.example.com/promo/summer-sale.png',
    action: { href: '/sale/summer', label: 'Подробнее' },
    dismissible: true,
  },
  {
    id: 'newcomer-bonus',
    name: 'Newcomer Bonus',
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2100-01-01T00:00:00.000Z',
    targeting: { minAge: 18 },
    maxImpressionsPerUser: 1,
    cooldownHours: 0,
    format: 'inline',
    title: 'Бонус новичку',
    description: 'Заберите приветственный бонус за первый визит.',
    action: { href: '/welcome', label: 'Забрать' },
  },
];

async function main(): Promise<void> {
  if (!config.s3.bucket) throw new Error('PROMO_BUCKET is not set');
  const promos = catalogueSchema.parse(seed); // fail fast if the seed is malformed
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: catalogueKey(),
      Body: JSON.stringify(promos, null, 2),
      ContentType: 'application/json',
    }),
  );
  console.log(`Seeded ${promos.length} promos to s3://${config.s3.bucket}/${catalogueKey()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check the script compiles (no bucket needed)**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors) — this also confirms the whole codebase type-checks after the refactor.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-catalogue.ts
git commit -m "feat: add seed-catalogue script for the initial S3 catalogue"
```

---

## Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all suites green (date/user/limit/cooldown checkers, selector, catalogue-schema, config-service, handle, server, validate, with-timeout).

- [ ] **Step 2: Run the type-checker**

Run: `npm run typecheck`
Expected: PASS — 0 errors. (Confirms no lingering `baseScore`/`scoreMultiplier`/`minScore`/`CheckResult` references.)

- [ ] **Step 3: Grep for removed identifiers (should be empty)**

Run: `git grep -nE "baseScore|scoreMultiplier|minScore|getCheckerConfig|CheckResult|scoreChecker" -- src scripts`
Expected: no output. If anything prints, remove it and re-run Steps 1–2.

- [ ] **Step 4: Final commit (if Step 3 required fixes; otherwise skip)**

```bash
git add -A
git commit -m "chore: remove lingering scoring references"
```

---

## Done

abhPromo now reads an ordered catalogue from S3 and selects the first eligible promo in
queue order, with boolean checkers and cooldown. The S3 bucket is provisioned later by the
user; until then, `npm test` (SDK mocked) fully validates the behaviour, and
`scripts/seed-catalogue.ts` populates the catalogue once a bucket exists.
