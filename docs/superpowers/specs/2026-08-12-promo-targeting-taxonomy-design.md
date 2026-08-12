# Design: Shared Promo Schema + Structured Device/Region/Category Targeting

- **Date:** 2026-08-12
- **Status:** Approved (ready for implementation plan)
- **Related:** `promo-bff` (Promozavr selection backend), new package `@zebrooo/promo-schema`

## Goal

Two changes, bundled because the second depends on the first:

1. Stop hand-duplicating the `Promo` Zod schema between `promo-cabinet` and `promo-bff`
   (today: `promo-cabinet/src/lib/schema.ts` and `promo-bff`'s `catalogue-schema.ts`,
   kept in sync only by a comment saying "MUST match byte-for-byte", no CI check — a
   drift here silently drops promos from the served catalogue via `safeParse`).
2. Replace three free-text targeting fields (`targeting.regions`, `sections`,
   `categories` — all edited today via a bare comma-separated `SlugListField`, zero
   validation against real values) with closed enums picked from a canonical list, and
   add a fourth explicit device target (`app`) that doesn't exist today.

This is scoped to the **B2B promo-selector** (topline/popup/overlay/tour promos,
`promo-cabinet` → S3 catalogue → `promo-bff`'s checker chain). The B2C CPM banner
auction (`ad_campaigns`, `run-auction.ts`, abkhaz-auto's `/lk/prodvizhenie/banner`
cabinet) is explicitly **out of scope** — not touched by this or any follow-up spec in
this series.

## Decisions (locked)

1. **New package `@zebrooo/promo-schema`**, published to GitHub Packages the same way
   `@zebrooo/service-ticket` and `@zebrooo/promo-renderer` already are (same org, same
   registry, same consumer pattern — both `promo-bff` and `promo-cabinet` already have
   `@zebrooo:registry=https://npm.pkg.github.com` in their `.npmrc`, so adding one more
   scoped package is zero new infra for the consumers).
2. **The package holds two things:**
   - The `Promo`/`PromoTargeting` Zod schema (moved out of both repos' hand-rolled
     copies — both import `PromoSchema`/`Promo` type from here instead).
   - Canonical taxonomy constants: `REGIONS`, `DEVICE_TARGETS`, `CATEGORIES` (all as
     `readonly` string-literal-union-backed arrays, so TypeScript narrows them at the
     call site — no separate "is this a valid region" runtime check needed beyond what
     Zod already gives via `z.enum(REGIONS)`).
3. **`REGIONS`** = the 9 canonical Abkhazia locations already used as `regions.slug` in
   abkhaz-auto: `sukhum, gagra, pitsunda, gudauta, novy-afon, ochamchyra, gulrypsh,
   tkuarchal, gal`. Hardcoded constant, not synced live from abkhaz-auto — this list
   changes on the order of years, not worth a cross-service fetch. Whoever adds a new
   region to abkhaz-auto's `regions` table bumps this package too (documented in the
   package README as a manual-sync reminder).
4. **`CATEGORIES`** = top-level sections only, mirroring abkhaz-auto's
   `home-data.ts` `CATEGORIES` slugs (`avto, zapchasti, shiny, diski, nedvizhimost,
   uslugi, rabota, elektronika, kompyutery, odezhda, tovary-doma, mebel, hobby,
   zhivotnye, oborudovanie, raznoye`, plus `baraholka`/`daily`/`garages`). **Explicitly
   NOT** the full brand/model tree (`cars-catalog.json` is ~350KB, changes on its own
   schedule, scraped from an external source) — brand/model-level targeting is a
   separate future spec if ever needed, not part of this change.
5. **`DEVICE_TARGETS`** grows from 3 values (`desktop`/`touch`/`both`) to 4:
   `desktop`/`touch`/`app`/`both`. Today `app` (native WebView surface, detected via
   abkhaz-auto's `isAppSurface()`) has no dedicated targeting value — a promo can only
   say `touch` (which today may or may not also match `app`, semantics unconfirmed) or
   `both`. Implementation must read `promo-bff/src/promo-selector/checkers/registry/
   Device.ts` first to confirm current `app`-vs-`touch` matching before changing it, and
   preserve backward compatibility for existing saved promos using `both`/`desktop`/
   `touch` (an existing `both` promo must keep matching `app` viewers after this ships —
   `both` means "any device", not "desktop+touch only").
6. **Cabinet UI**: `TargetingSection.tsx`'s three `SlugListField` free-text inputs
   (regions, sections, categories) become closed multiselects sourced from
   `@zebrooo/promo-schema`'s constants. `DevicePlacementSection.tsx`'s 3 pills become 4.
7. **Migration of existing saved promos**: no data migration needed. Existing promos in
   the S3 catalogue keep whatever string values they already have; the Zod schema
   change only affects *new writes* from the cabinet form (`z.enum(REGIONS)` instead of
   `z.array(z.string())`). A promo with an old free-text region value that isn't in the
   new enum still round-trips on **read** (the BFF's `parsePoolLeniently` already
   fail-soft skips/warns on a single invalid item rather than erroring the whole pool —
   unchanged behavior) but **cannot be re-saved unedited** from the cabinet without the
   operator picking a valid region from the new list. This is acceptable: it surfaces
   exactly the kind of stale/typo'd value this spec exists to eliminate.

## Non-goals / out of scope

- B2C `ad_campaigns` CPM auction (`run-auction.ts`, `campaign-service.ts`,
  abkhaz-auto's advertiser self-serve cabinet) — untouched.
- Behavioral interest/affinity targeting — separate spec (next in this series).
- Activity/spend-tier targeting — separate spec (after interest/affinity).
- Category drill-down below top-level (car brands/models, goods subcategories) — future
  spec if demand shows up, not blocking this one.
- Live sync of `REGIONS`/`CATEGORIES` from abkhaz-auto — deliberately a hardcoded,
  manually-maintained constant (see decisions 3–4).
- Any change to `profiles.city` free-text normalization in abkhaz-auto itself — the
  user-side location signal stays as-is; this spec only closes the *authoring* side
  (what an operator can type into a promo's `regions` field), not the *matching* side's
  data quality on the user-profile end.

## Package structure (`@zebrooo/promo-schema`)

```
src/
├── schema.ts       # Promo, PromoTargeting, PromoFormat Zod schemas + inferred types
├── taxonomy.ts      # REGIONS, DEVICE_TARGETS, CATEGORIES readonly arrays + union types
└── index.ts         # re-exports
```

Both `promo-bff` and `promo-cabinet` add it as a normal `dependencies` entry (not a
workspace link — they're independently deployed repos, same as the existing
`@zebrooo/service-ticket` dependency).

## Testing

- New package: unit tests that `Promo` schema round-trips valid fixtures and rejects
  out-of-enum values for `regions`/`categories`/`deviceTarget`.
- `promo-bff`: existing checker tests (`registry/Targeting.test.ts` /
  `registry/Context.test.ts` / `registry/Device.test.ts` if they exist, else new ones)
  extended to cover the enum-typed fields; a new case for `deviceTarget: 'app'` matching
  only `ctx.device === 'app'`, and a backward-compat case that an existing `both` promo
  still matches `ctx.device === 'app'`.
- `promo-cabinet`: `schema.test.ts` updated for the new enum shape; a component-level
  check (or manual QA note in the plan) that the multiselects render all taxonomy
  values and reject free text.
