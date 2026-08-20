// Replaces the old sanitize() + promoSchema.parse() pair. Where sanitize()
// used to zero out fields via a hand-rolled CAPS table, the discriminated
// union in promoSchema now does that stripping for us (parse() drops any key
// outside the active format's member schema) — so `normalize` below only
// needs to handle the handful of derivations that AREN'T pure "wrong format
// → strip" cases: custom's derived title, and the divkitJson→undefined fixup
// after a successful S3 upload.
import { promoSchema, servingBlockSchema, CONTENT_KEYS_BY_FORMAT, type Promo } from '@/lib/schema';
import { KNOWN_CUSTOM_VARIANTS } from '@/lib/custom-variants';
import { compactLifecycle } from '@/lib/lifecycle';
import { isFullCoverage } from './schedule-presets';

/**
 * Derive the values that must be correct before the union-validated parse,
 * then let promoSchema.parse() strip everything outside the active format's
 * member schema (mirrors the old sanitize()'s CAPS-driven undefined-outs,
 * minus the dead popupVariant/bullets fields — gone from the schema, so the
 * union already strips them for every format).
 */
function normalize(rawValues: Promo): Promo {
  // Очищенные lifecycle-контролы = «гейта нет», а не пустой объект в S3
  // (refine схемы отверг бы {} / all-undefined).
  const values = compactLifecycle(rawValues);
  // Custom: кабинет не управляет заголовком (визуал у хоста), но title всё
  // ещё обязателен в servingBlockSchema. Деривим человекочитаемый title из
  // label варианта (fallback — name промо), как делал sanitize().
  const title =
    values.format === 'custom'
      ? (values.title?.trim() ||
         KNOWN_CUSTOM_VARIANTS.find((v) => v.id === values.variant)?.label ||
         values.name)
      : values.title;

  // ctaColor/ctaTextColor имеют смысл только когда есть action — зеркалит
  // sanitize(). (У форматов без action-поля в схеме union их всё равно
  // вырежет parse(), но inline/popup/fullscreen/tooltip реально читают
  // action, так что здесь это не no-op.)
  const ctaColor     = values.action ? values.ctaColor     : undefined;
  const ctaTextColor = values.action ? values.ctaTextColor : undefined;

  // Period/match are only modifiers: without phrases or sections there is
  // no search criterion, so the nested block must not enable targeting.
  const search = values.targeting.search;
  const hasSearchCriteria = Boolean(search?.terms?.length || search?.sections?.length);
  let targeting = values.targeting;
  if (search && !hasSearchCriteria) {
    const { search: discardedSearch, ...withoutSearch } = values.targeting;
    void discardedSearch;
    targeting = withoutSearch;
  }

  // Purchases/balance: same "real criteria, not raw key count" rule as
  // search — every field-clear handler in TargetingSection.tsx sets a
  // cleared field to `undefined` rather than deleting the key, so
  // Object.keys().length alone would wrongly treat a fully-cleared block
  // as still having a criterion. lookbackDays/movementLookbackDays are
  // modifiers only, exactly like search's lookbackDays/match.
  const purchases = values.targeting.purchases;
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

  const balance = values.targeting.balance;
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
  const listings = values.targeting.listings;
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
  const behavior = values.targeting.behavior;
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
  targeting = {
    ...targeting,
    newcomerMaxAgeDays: targeting.visitorClass === 'newcomer' ? targeting.newcomerMaxAgeDays : undefined,
    regularMinVisitDays: targeting.visitorClass === 'regular' ? targeting.regularMinVisitDays : undefined,
  };

  // Полное покрытие (7 дней + 0–24) = «без ограничений» — поле в S3 не
  // пишется вовсе; форма при загрузке промо без поля показывает то же
  // состояние, круг замыкается (спека targeting-schedule §2.1).
  const schedule = isFullCoverage(values.schedule) ? undefined : values.schedule;

  // entrySources: [] = «любой источник» = поля нет (SourceChecker в BFF
  // скипается по отсутствию правила).
  const entrySources = values.entrySources?.length ? values.entrySources : undefined;

  // Волна C: снятый чекбокс (false) и пустое поле цепочки по клику — это
  // «правила нет», а не false/'' в S3 (ReactionChecker/ChainChecker BFF
  // скипаются по отсутствию поля; пустую строку схема бы вообще отвергла).
  const suppressAfterClick = values.suppressAfterClick === true ? true : undefined;

  // Лид-режим: кнопка отправляет телефон и НИКУДА не ведёт, но href в схемах
  // (и здесь, и в BFF) обязателен внутри action — пишем заглушку '#', а подпись
  // по умолчанию делаем осмысленной: человек должен понимать, на что жмёт.
  const leadCapture = values.leadCapture === true ? true : undefined;
  // Номер живёт только вместе с включённым сбором: выключили галочку — поле
  // из пула уходит, чтобы не хранить чужой телефон без нужды.
  const leadPhone = leadCapture ? normalizeLeadPhone(values.leadPhone) : undefined;
  const action = leadCapture
    ? { href: '#', label: values.action?.label?.trim() || 'Связаться' }
    : values.action;
  const afterClickPromoId = values.afterClickPromoId?.trim() ? values.afterClickPromoId : undefined;

  return {
    ...values,
    title,
    targeting,
    schedule,
    entrySources,
    suppressAfterClick,
    leadCapture,
    leadPhone,
    action,
    afterClickPromoId,
    ctaColor,
    ctaTextColor,
    // ФИКС бага sanitize(): divkitJson больше не утекает в пул после
    // успешного S3-аплоада — вызывающий код (submit-флоу в PromoForm.tsx)
    // обязан явно поставить divkitUrl и обнулить divkitJson до вызова
    // toPersisted; здесь мы лишь укрепляем инвариант «оба поля разом не
    // живут» на случай, если вызывающий код этого не сделал.
    divkitJson: values.divkitUrl ? undefined : values.divkitJson,
  };
}

/** Turn Formik's flat draft state into a format-stripped, schema-valid Promo
 *  ready for the API. Throws (ZodError) on invalid input — callers are
 *  expected to run validatePromoForm() first so this should only throw on
 *  programmer error. */
export function toPersisted(values: Promo): Promo {
  return promoSchema.parse(normalize(values)) as Promo;
}

const servingKeys = new Set<string>([...Object.keys(servingBlockSchema.shape), 'format']);

/**
 * Lenient preview projection — used by PreviewRail while the draft may still
 * be mid-edit/invalid. Unlike toPersisted(), this NEVER throws and does no
 * zod validation: it just keeps serving keys + the active format's content
 * keys (CONTENT_KEYS_BY_FORMAT), running the same normalize() derivations
 * (custom title-derive, divkitJson cleanup, CTA-colors-only-with-action) so
 * the preview matches what toPersisted() would eventually render — without
 * ever falling back to raw cross-format values (e.g. a leftover `steps`
 * array from a previous format still on the draft would otherwise leak into
 * a popup preview).
 */
export function toPreview(values: Promo): Promo {
  const normalized = normalize(values);
  const allowedKeys = new Set<string>([...servingKeys, ...CONTENT_KEYS_BY_FORMAT[normalized.format]]);
  const projected = Object.fromEntries(
    Object.entries(normalized).filter(([key]) => allowedKeys.has(key)),
  );
  return projected as Promo;
}

/** Приводит введённый номер к E.164 (+7…): человек печатает как привык —
 *  «8 999 …», «+7 (999) …», — а в пул и в доставку уходит один формат, иначе
 *  привязка чата по номеру не найдётся. Неразбираемое значение отдаём как
 *  есть: его завернёт схема и покажет ошибку в форме. */
export function normalizeLeadPhone(raw: string | undefined): string | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '8' || digits[0] === '7')) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  return value.startsWith('+') ? `+${digits}` : value;
}
