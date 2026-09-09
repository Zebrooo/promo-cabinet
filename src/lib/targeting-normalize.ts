/**
 * Нормализация блока targeting.* перед записью: под-блоки без настоящего
 * критерия (только модификаторы вроде lookbackDays, либо все поля очищены в
 * undefined из Formik-стейта) выкидываются целиком, пороги профиля визита
 * живут только вместе со своим классом. Вынесено из to-persisted.ts, потому
 * что ту же нормализацию делает форма пуш-рассылок (push-campaign-form/
 * to-persisted.ts): оси таргетинга у промо и пушей одни и те же.
 */
import type { Promo } from './schema';

export type PromoTargeting = Promo['targeting'];

export function normalizeTargeting(input: PromoTargeting): PromoTargeting {
  let targeting = input;

  // Period/match are only modifiers: without phrases or sections there is
  // no search criterion, so the nested block must not enable targeting.
  const search = input.search;
  const hasSearchCriteria = Boolean(search?.terms?.length || search?.sections?.length);
  if (search && !hasSearchCriteria) {
    const { search: discardedSearch, ...withoutSearch } = targeting;
    void discardedSearch;
    targeting = withoutSearch;
  }

  // Purchases/balance: same "real criteria, not raw key count" rule as
  // search — every field-clear handler in the targeting editors sets a
  // cleared field to `undefined` rather than deleting the key, so
  // Object.keys().length alone would wrongly treat a fully-cleared block
  // as still having a criterion. lookbackDays/movementLookbackDays are
  // modifiers only, exactly like search's lookbackDays/match.
  const purchases = input.purchases;
  const hasPurchaseCriteria = Boolean(
    purchases &&
    (purchases.purchased !== undefined ||
      purchases.minTotalKopecks !== undefined ||
      purchases.maxTotalKopecks !== undefined ||
      purchases.minCount !== undefined ||
      purchases.maxCount !== undefined ||
      purchases.packTypes?.length),
  );
  if (purchases && !hasPurchaseCriteria) {
    const { purchases: discardedPurchases, ...withoutPurchases } = targeting;
    void discardedPurchases;
    targeting = withoutPurchases;
  }

  const balance = input.balance;
  const hasBalanceCriteria = Boolean(
    balance &&
    (balance.currentAbove !== undefined ||
      balance.currentBelow !== undefined ||
      balance.movementAbove !== undefined ||
      balance.movementBelow !== undefined),
  );
  if (balance && !hasBalanceCriteria) {
    const { balance: discardedBalance, ...withoutBalance } = targeting;
    void discardedBalance;
    targeting = withoutBalance;
  }

  // Listings: same "real criteria, not raw key count" rule as
  // search/purchases/balance. categoriesMatch is a modifier only (like
  // search's match/purchases' lookbackDays) — it alone must not keep the
  // block alive.
  const listings = input.listings;
  const hasListingsCriteria = Boolean(
    listings &&
    (listings.categories?.length ||
      listings.activeCategories?.length ||
      listings.hasUnpromotedActive !== undefined ||
      listings.inactiveDays !== undefined),
  );
  if (listings && !hasListingsCriteria) {
    const { listings: discardedListings, ...withoutListings } = targeting;
    void discardedListings;
    targeting = withoutListings;
  }

  // Behavior: то же правило «настоящий критерий, а не число ключей».
  // interest без категорий — только модификатор lookbackDays, критерия нет →
  // под-блок выкидывается целиком; hotBuyer жив самим фактом присутствия
  // (пустой {} = «горячий покупатель» с дефолтным порогом BFF 2);
  // minSessionViews — самостоятельный критерий. Пустой блок в promos.json
  // не пишется.
  const behavior = input.behavior;
  if (behavior) {
    const interest = behavior.interest?.categories?.length ? behavior.interest : undefined;
    const { hotBuyer, minSessionViews } = behavior;
    if (!interest && !hotBuyer && minSessionViews === undefined) {
      const { behavior: discardedBehavior, ...withoutBehavior } = targeting;
      void discardedBehavior;
      targeting = withoutBehavior;
    } else {
      targeting = { ...targeting, behavior: { interest, hotBuyer, minSessionViews } };
    }
  }

  // Пороги профиля визита живут только вместе со своим классом: порог чужого
  // класса (или совсем без класса — переключили select назад) не должен
  // утекать в пул.
  return {
    ...targeting,
    newcomerMaxAgeDays: targeting.visitorClass === 'newcomer' ? targeting.newcomerMaxAgeDays : undefined,
    regularMinVisitDays: targeting.visitorClass === 'regular' ? targeting.regularMinVisitDays : undefined,
  };
}
