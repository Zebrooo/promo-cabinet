// Re-export shim — the promo editor moved to ./promo-form/PromoForm.tsx as
// part of PR-2 (per-format schemas + Formik). Kept so existing imports of
// `@/components/PromoForm` keep working; new code should import from
// `@/components/promo-form/PromoForm` directly.
export { PromoForm } from './promo-form/PromoForm';
