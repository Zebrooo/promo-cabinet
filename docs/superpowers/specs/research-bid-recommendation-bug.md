# Bid-recommendation bug research: "lower bid → more impressions but lower chance"

> User report (RU): «рекомендация 14 ₽, вбил 10 от руки, показов больше стало,
> а шанс уменьшился — в чём логика?»

## TL;DR

The bug is **not** in `promo-cabinet` or `abhPromo`. It lives entirely in
`abkhaz-auto/src/app/lk/reklama/forecast.ts`. "Projected impressions" and
"Шанс (chance)" are computed by **two independent formulas that are never
reconciled** — they're glued together in the same card and free to disagree.

- **Impressions** = `min(pool × winRate(cpm), budget/cpm × 1000)`
- **Chance**      = bucket label derived purely from `cpm / suggestedCpm`

When a campaign is **budget-capped**, the impressions number is driven by
`budget / cpm × 1000` — strictly inverse to bid. The chance label keeps
tracking `cpm / suggestedCpm`. Lowering bid → budget cap relaxes → more
impressions; chance bucket stays the same or drops. They move in opposite
directions, by design, by accident.

## 1. Where the UI lives

User-visible flow (none of this is in `promo-cabinet` — that codebase is the
B2C **house-promo** admin, no bidding UI):

- Editor entry: `abkhaz-auto/src/app/lk/reklama/[id]/page.tsx` and `.../new/page.tsx`
- Editor component: `abkhaz-auto/src/app/lk/reklama/CampaignEditor.tsx`
- Recommendation hint (the "14 ₽"): `CampaignEditor.tsx:406-410`
  ```tsx
  {suggested !== null && (
    <div className="cmp-hint cmp-hint-suggested">
      💡 Для вашей конфигурации справедливая цена ≈ <b>{formatRoubles(suggested)} ₽</b>
      за 1000 показов … Пресеты — варианты вокруг неё.
    </div>
  )}
  ```
- Bid inline feedback under the input: `CampaignEditor.tsx:416-418`
- Forecast card (показов / Шанс / Точность): `abkhaz-auto/src/app/lk/reklama/ForecastCard.tsx`

Both "показов" and "Шанс" come from one object: `forecast = computeForecast(f)`
in `CampaignEditor.tsx:68`. So they are guaranteed consistent with each other
in **input** (same form, same recompute), but the **internals** model two
unrelated things.

## 2. Where the numbers come from

### 2a. Recommended bid ("14 ₽")

`abkhaz-auto/src/app/lk/reklama/pricing.ts:11-28` — reach-weighted base CPM ×
format multiplier:

```ts
const weighted = selected.reduce((s, p) => s + p.baseCpmRub * p.reach, 0) / totalReach;
const multiplier = FORMAT_CPM_MULTIPLIER[f.bannerFormat as AdFormat] ?? 1.0;
const raw = weighted * multiplier;
return Math.max(1, Math.round(raw * 10) / 10);
```

Inputs: `AD_PAGES[].baseCpmRub` and `.reach` from
`abkhaz-auto/src/lib/ad-slots.ts:40-53` (e.g. `home: { reach: 120000, baseCpmRub: 20 }`)
plus format multiplier `horizontal 1.2 / block 1.0 / vertical 0.7`
(`ad-slots.ts:60-64`). Hand-tuned, calibrated to "half of Yandex.Direct CPMs".

Notably the formula sees **only the page mix + format** — it ignores:
- the queue / number of competing campaigns
- the user's chosen audience (allPages still only weights by reach, not "who is targeted")
- the user's budget
- real auction history

So "14 ₽" is the static reach-weighted price, not a "you need ≥14 to win"
estimate. The cabinet text calls it «справедливая цена» but does not claim it
is a win-threshold — yet the chance bucket uses it as if it were one.

The exact "14 ₽" scenario the user hit is reproducible: `vertical + home` →
`20 × 0.7 = 14`, see `pricing.test.ts:72-89`.

### 2b. Projected impressions and chance

`abkhaz-auto/src/app/lk/reklama/forecast.ts:51-90`:

```ts
const suggested = suggestedCpm(f) ?? SIGMOID_FALLBACK_CENTER;
const inventoryWon = monthlyPool * winRate(cpm, suggested);
// ...
const inventoryAtBudget = budgetMonthly === Infinity ? Infinity : (budgetMonthly / cpm) * 1000;
const impressions = Math.floor(Math.min(inventoryWon, inventoryAtBudget));
const budgetCapped = inventoryAtBudget < inventoryWon;
// ...
const winChance: WinChance =
  cpm >= suggested * WIN_CHANCE_HIGH_THRESHOLD ? "Высокий" :
  cpm >= suggested * WIN_CHANCE_MID_THRESHOLD  ? "Средний" : "Низкий";
```

with `winRate` a sigmoid centered on `suggested` (`forecast.ts:45-49`):
`winRate(cpm) = 1 / (1 + exp(-(cpm - suggested)/3))`.

So:

| Number   | Formula                                           | Depends on bid how? |
|----------|---------------------------------------------------|---------------------|
| impressions (auction branch) | `pool × σ((cpm - suggested)/3)`          | **monotonically rising** with bid |
| impressions (budget branch)  | `budget × 1000 / cpm`                    | **monotonically falling** with bid |
| impressions shown            | `min(above two)`                         | rising or falling depending on which branch binds |
| Шанс (chance)                | bucket of `cpm / suggested`              | **monotonically rising** with bid |

The crucial property: when the **budget branch binds** (which happens
exactly when the campaign has a small `daily`/`total` budget relative to the
auction inventory it could otherwise win), the displayed impressions number
is `budget / cpm × 1000` — purely inverse to bid. Chance, meanwhile, is
indexed off `cpm / suggested` and keeps going down. The two diverge.

## 3. Reproducing the user's complaint

Take the most plausible config matching "rec=14":

- `bannerFormat = "vertical"`, `pages = ["home"]` → `suggested = 14`
  (see `pricing.test.ts:72`)
- `pool = home.reach = 120 000`
- Say `dailyRub = 5` → `budgetMonthly = 150 ₽`

Move bid 14 → 9 (preset "Эконом" rounds to ~9.8; even a "10" manual entry
puts you within rounding):

|         | inventoryWon (auction) | inventoryAtBudget (budget) | impressions = min | winChance bucket |
|---------|------------------------|----------------------------|-------------------|------------------|
| cpm=14  | 120000 × 0.5  = 60 000 | 150/14 × 1000 ≈ 10 714     | **10 714 (capped)** | "Средний" (ratio 1.0) |
| cpm=10  | 120000 × 0.21 ≈ 25 047 | 150/10 × 1000 = 15 000     | **15 000 (capped)** | "Средний" (ratio 0.71) |
| cpm=9.7 | …                      | 150/9.7 × 1000 ≈ 15 464    | **15 464 (capped)** | **"Низкий"** (ratio < 0.7) |

So the user sees: budget-bound impressions go **up** (10 714 → 15 464) while
the chance bucket tips into "Низкий". Exactly the reported contradiction.

`budgetCapped` is computed (`forecast.ts:75`) but the only thing the UI does
with it is **not** show a "raise your budget for more reach" hint
(`forecast.ts:102-107` notes that hint was deliberately killed). There is no
banner telling the user "you're seeing the budget number, not the auction
number" — the impressions tile silently swaps between two regimes.

## 4. Diagnosis of the UX problem

What the user reasonably expects from a "Шанс" + "показов в месяц" pair is a
single story: "raise bid → win more auctions → see more impressions". The
current code tells a confused two-stream story:

1. "How often you'd win if budget were infinite" (chance bucket, hidden continuous σ).
2. "How many impressions your money can buy if every auction were free"
   (`budget / cpm × 1000`, ignoring win probability entirely).

`impressions = min(1, 2)`. When (2) binds, (1) is invisible in the headline
number but still drives the Шанс label.

Adjacent UX smells:

- **"Шанс" is a 3-level bucket** with thresholds at 0.7× and 1.2× of suggested.
  Tiny bid changes around the boundary teleport the label (Средний ↔ Низкий),
  which is what makes the contradiction *salient*. A continuous % would
  remove the discrete jump even if the underlying disagreement remained.
- **`pickFeedback` warn-branch suggests `Math.ceil(suggested * 0.7)`**
  (`forecast.ts:114`) — for suggested=14 that's 10. Caller in
  `CampaignEditor.tsx:418` hard-codes `"Поднимите до 5 ₽+"` regardless of
  suggested, contradicting the forecast feedback string. Two warn texts can
  show at once (`Feedback` in editor and `feedback` from `computeForecast`).
- **`enoughForLaunch` in `CampaignEditor.tsx:79`** treats balance as "ok if
  ≥ 1× CPM" (`balanceKopecks >= cpmKopecks`). 1 CPM-kopeck = 1 impression's
  worth of charging only at 1/1000 of CPM, so the threshold is effectively
  "balance ≥ price of 1000 impressions". Fine, but the BalanceCard text
  («хватит на запуск кампании») hides this — user has no idea how many
  impressions their balance buys.
- **Pool calc ignores frequency cap / cooldown / format-vs-slot reality.**
  `monthlyPool = Σ AD_PAGES[k].reach` treats every pageview as a winnable
  impression. In `abhPromo`'s actual auction
  (`abhPromo/src/auction/run-auction.ts:75-104`) advertisers are deduped per
  batch and slots are format-gated. The cabinet's pool is an upper bound the
  user can never realistically saturate; combined with no-competition-modelling,
  it inflates impressions across both branches.
- **`SIGMOID_FALLBACK_CENTER = 7`** (`forecast.ts:37`) hard-codes a center
  when `suggestedCpm` returns null, but `computeForecast` already returns
  `placeholder(...)` when there are no sections (`forecast.ts:61`), so the
  fallback is unreachable in practice — vestigial.
- **AI prompt floors** at `suggestedCpmRub` in
  `abhPromo/src/models/enhance-promo/handle.ts:69-73, 257-263`
  (window `[0.5×, 1.5×] × suggested` per `CPM_BASELINE_MIN/MAX_RATIO`). The
  AI is allowed to recommend bids *below* a manually-typed 10 ₽ when
  suggested=14, then forecast tells the user that exact bid is "Низкий" —
  cross-system inconsistency.

## 5. Fix options

**(a) Unify the model.** Make impressions = expected number of auctions you
*both* win *and* can afford to pay for:

```
expectedImpressionsPerMonth =
  min(pool, budget/cpm × 1000) × winRate(cpm)
```

Or equivalently:
```
auctionsAvailable      = pool
auctionsWon            = auctionsAvailable × winRate
impressionsPaidFor     = min(auctionsWon, budget/cpm × 1000)
```

Now lowering bid: both `winRate` and the bucket fall, and impressions
**cannot exceed** `pool × winRate`. The budget branch is a ceiling on top of
auction outcome, not a parallel computation. The two displayed numbers
necessarily co-move with bid. Trade-off: in a tight-budget regime the
impressions number now also drops with bid (counterintuitive for an
advertiser who *thinks* of budget/cpm = impressions); needs a tooltip.

**(b) Drop "Шанс" entirely; keep a single honest metric.** The headline
becomes "≈ 15 000 показов в месяц при ставке 10 ₽" with a sub-line
explaining whether bid or budget is the binding constraint:

- "Бюджет упирается в дневной лимит — поднимите дневной бюджет"
- "Ставка ниже справедливой — конкуренты выигрывают примерно 80% аукционов"

Replace the bucket with the bottleneck label. Less precise, far less
contradictory.

**(c) Show both, but make their relationship explicit.** Render Шанс as a
percent (the raw `winRate`) and label impressions as "из них вы окупите
бюджетом ~N". Bullet the math so the user sees the join.

**(d) Cheapest fix (no UX rework): suppress "Шанс" when `budgetCapped`
holds**, or show a fixed "ограничено бюджетом" badge in place of the bucket.
Honest about which constraint binds. Keeps the rest of the code as-is.

My recommendation: **(a) + (c)**. Unify the math (a) so the formulas can't
contradict, then surface the join in copy (c) so the advertiser learns the
mental model. (d) is a same-day mitigation if you can't ship (a) this week.

## 6. Adjacent issues worth tracking

- `WIN_CHANCE_MID_THRESHOLD = 0.7` used in two places (`forecast.ts:42-43,
  113-115`) — comment warns about this dual use; brittle.
- Inline `Feedback` ladder in `CampaignEditor.tsx:416-418` duplicates
  `forecast.feedback`; the hard-coded "Поднимите до 5 ₽+" ignores
  `suggested`. Either delete it or compute hint = `Math.ceil(suggested *
  0.7)`.
- `presetCpms` lower preset `economy = 0.7 × suggested` lands exactly on the
  Средний/Низкий boundary — clicking "Эконом" gives you ratio exactly 0.7
  and label "Средний" *now* (≥ uses `>=`), but any rounding-down move
  flips to "Низкий". Latent footgun.
- `FALLBACK_PRESET_CPMS = { economy: 5, standard: 10, premium: 20 }`
  (`ad-slots.ts:79`) — the empty-form fallback "Обычный" 10 ₽ matches the
  user's manual entry. If the user clicked "Обычный" with no sections
  selected, then added `vertical+home` (suggested=14), the bid would stay at
  10 — explaining how they ended up at 10 ₽ without ever typing it.
- Cabinet ad-slot reach numbers live only in source; calibration note at
  `ad-slots.ts:37-39` says "update quarterly" — currently no test that asserts
  the sum (381 000) stays in sync with `forecast.test.ts:51` assertion.
