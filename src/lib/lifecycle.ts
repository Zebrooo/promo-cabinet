import type { Promo } from './schema';

/**
 * Схлопывает «пустой» lifecycle-блок в undefined. Formik после очистки
 * контролов оставляет lifecycle: {} или ключи-undefined, а схема справедливо
 * требует ≥1 заданного условия — без компакции юзер, очистивший все четыре
 * контрола, получал бы ошибку «пустой блок» и невалидную форму.
 * Дёргается из validatePromoForm() и normalize() (to-persisted.ts).
 */
export function compactLifecycle(values: Promo): Promo {
  const lc = values.lifecycle;
  if (lc === undefined) return values;
  const defined = Object.fromEntries(Object.entries(lc).filter(([, v]) => v !== undefined));
  return Object.keys(defined).length > 0
    ? { ...values, lifecycle: defined as Promo['lifecycle'] }
    : { ...values, lifecycle: undefined };
}
