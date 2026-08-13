// Replaces the old sanitize() + promoSchema.parse() pair. Where sanitize()
// used to zero out fields via a hand-rolled CAPS table, the discriminated
// union in promoSchema now does that stripping for us (parse() drops any key
// outside the active format's member schema) — so `normalize` below only
// needs to handle the handful of derivations that AREN'T pure "wrong format
// → strip" cases: custom's derived title, and the divkitJson→undefined fixup
// after a successful S3 upload.
import { promoSchema, servingBlockSchema, CONTENT_KEYS_BY_FORMAT, type Promo } from '@/lib/schema';
import { KNOWN_CUSTOM_VARIANTS } from '@/lib/custom-variants';

/**
 * Derive the values that must be correct before the union-validated parse,
 * then let promoSchema.parse() strip everything outside the active format's
 * member schema (mirrors the old sanitize()'s CAPS-driven undefined-outs,
 * minus the dead popupVariant/bullets fields — gone from the schema, so the
 * union already strips them for every format).
 */
function normalize(values: Promo): Promo {
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

  return {
    ...values,
    title,
    targeting,
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
