/**
 * Registry of custom promo variants — one entry per host-side render function.
 *
 * Each entry's `id` must match the key of `customFormats` on the host's
 * <PromoProvider config={{ customFormats: {...} }}>. If a promo is saved in
 * S3 with `format:'custom' + variant:'x'` but no host registers 'x', the
 * PromoRenderer silently skips the promo (unknown_variant close reason).
 *
 * Cabinet reads this list to render the format dropdown when admin picks
 * `format:'custom'`; validation in schema.ts rejects any variant not in
 * this list, so admins can't save a typo.
 *
 * Adding a new variant here does NOT publish anything — it just makes the
 * variant selectable in the cabinet. The host repo must independently add
 * the render function to its <PromoProvider>.
 */
export interface CustomVariant {
  id: string;
  label: string;
  description: string;
  host: string;
}

export const KNOWN_CUSTOM_VARIANTS = [
  {
    id: 'reklama-onboarding',
    label: 'Онбординг рекламного кабинета',
    description:
      '4-шаговый визард знакомства с редактором кампаний (ReklamaWizardStage). Живёт в abkhaz-auto-web.',
    host: 'abkhaz-auto-web',
  },
  {
    id: 'referral-invite',
    label: 'Реферальная программа (приглашения)',
    description:
      'Не рендерит контент на сайте — это конфиг-промо: поля формы зеркалируются в ' +
      'таблицу referral_config (singleton id=1) abkhaz-Supabase через promo-bff. ' +
      'Сам инвайт-флоу целиком на стороне abkhaz-auto-web.',
    host: 'abkhaz-auto-web',
  },
] as const satisfies readonly CustomVariant[];

export type KnownCustomVariantId = (typeof KNOWN_CUSTOM_VARIANTS)[number]['id'];
