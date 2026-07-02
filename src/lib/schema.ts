import { z } from 'zod';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip', 'multistep']);
export const audienceSchema = z.enum(['all', 'authenticated', 'anonymous']);
export const deviceTargetSchema = z.enum(['desktop', 'touch', 'both']);
/** Линейный градиент для popup/fullscreen/sheet — каскадом с image/color
 *  (см. composeOverlayBackground в @zebrooo/promo-renderer). */
export const backgroundGradientSchema = z.object({
  from:  z.string().min(1),
  to:    z.string().min(1).optional(),
  angle: z.number().min(0).max(360).optional(),
});

/** Вариант шаблона popup'а. `classic` — стандартный из @zebrooo/promo-renderer
 *  (image сверху → title → description → CTA внизу). `split` — наш кастом-
 *  layout: image hero ~40% высоты с «АВТОПОДБОР»-pill бейджем и красной
 *  divider-линией, ниже белая зона с title + description + bullets + CTA
 *  по всю ширину. Рендерится в abkhaz-auto/components/promo/SplitPopup.tsx
 *  ДО передачи в PromoRenderer (intercept по `popupVariant`). */
export const popupVariantSchema = z.enum(['classic', 'split']);

/** Выравнивание текста в overlay-форматах. Только горизонтальное — для
 *  вертикального renderer уже сам центрирует через flex. */
export const textAlignSchema = z.enum(['left', 'center', 'right']);

/** Один шаг multistep-визарда: заголовок + текст. Лимиты повторяют
 *  wizard-steps.ts на storefront (title ≤ 80, body ≤ 240) — что не влезло,
 *  web всё равно обрежет, поэтому честнее не пустить на этапе формы. */
export const promoStepSchema = z.object({
  title: z.string().min(1).max(80),
  body:  z.string().min(1).max(240),
});

/**
 * Validation source of truth for a promo. MUST match abhPromo's catalogue-schema.ts.
 * The `startsAt < endsAt` rule is enforced with a refinement.
 */
export const promoSchema = z
  .object({
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
    // Optional per-user cap. Legacy data used 0 = unlimited; coerce that to
    // undefined (the new "unlimited") so old catalogues still parse.
    maxImpressionsPerUser: z.preprocess(
      (v) => (v === 0 ? undefined : v),
      z.number().int().positive().optional(),
    ),
    cooldownHours: z.number().int().nonnegative(),
    /** Цепочка показов: id промо-предшественника. Промо с этим полем BFF
     *  отдаёт только после зафиксированного показа предшественника
     *  (ChainChecker). Ограничения побайтово те же, что в catalogue-schema.ts
     *  BFF. Санити afterPromoId !== id — refine ниже. */
    afterPromoId: z.string().min(1).max(64).optional(),
    format: promoFormatSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    action: z.object({ href: z.string().min(1), label: z.string().optional() }).optional(),
    dismissible: z.boolean().optional(),
    backgroundColor: z.string().optional(),
    backgroundGradient: backgroundGradientSchema.optional(),
    textColor: z.string().optional(),
    backgroundImage: z.string().optional(),
    /** Цвет CTA-кнопки (background). Если пусто — дефолт renderer'а
     *  (тёмно-красный). textColor отдельно — для контента, не кнопки. */
    ctaColor: z.string().optional(),
    /** Цвет текста на CTA-кнопке. Если пусто — белый. */
    ctaTextColor: z.string().optional(),
    /** Горизонтальное выравнивание контента (title + description + bullets). */
    textAlign: textAlignSchema.optional(),
    /** Шаблон popup'а — classic (renderer) или split (наш кастом). */
    popupVariant: popupVariantSchema.optional(),
    /** Маркированный список под description (для split-варианта,
     *  но рендерим везде если задан). Каждый buleted item — короткая фраза. */
    bullets: z.array(z.string().min(1).max(80)).max(6).optional(),
    /** DivKit-формат: URL на JSON-верстку в S3 (production-вариант). */
    divkitUrl: z.string().url().optional(),
    /** DivKit-формат: inline JSON-верстка для preview ДО сохранения промо.
     *  При save кабинет улетит ею в S3, заполнит divkitUrl, обнулит это
     *  поле. В prod-S3 промо НЕ содержит divkitJson. */
    divkitJson: z.unknown().optional(),
    /** Tooltip-формат: id якоря из CANONICAL_ANCHORS, к элементу которого
     *  привязан пузырёк (хост помечает элемент data-promo-anchor="<id>").
     *  Обязателен когда format==='tooltip' (см. refine ниже). */
    anchor: z.string().min(1).optional(),
    /** Multistep-формат: шаги визарда (2..6). Storefront рендерит их
     *  собственным ReklamaWizard (не через PromoRenderer). Обязателен когда
     *  format==='multistep' (см. refine ниже, как anchor у tooltip). */
    steps: z.array(promoStepSchema).min(2).max(6).optional(),
    audience: audienceSchema.optional(),
    sections: z.array(z.string().min(1)).optional(),
    categories: z.array(z.string().min(1)).optional(),
    sellerStatus: z.enum(['seller', 'buyer']).optional(),
    /**
     * Где промо должно показываться. По умолчанию `'both'`. BFF
     * select-promo фильтрует кандидатов: если deviceTarget = 'touch',
     * промо не вернётся desktop-юзеру и наоборот. Кабинет дополнительно
     * скрывает формат `topline` если выбран touch (рендерер его не
     * поддерживает на тач-устройствах, см. FORMATS_BY_DEVICE).
     */
    deviceTarget: deviceTargetSchema.optional(),
  })
  .refine((p) => new Date(p.startsAt).getTime() < new Date(p.endsAt).getTime(), {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
  })
  .refine((p) => p.format !== 'tooltip' || (typeof p.anchor === 'string' && p.anchor.length > 0), {
    message: 'anchor is required for the tooltip format',
    path: ['anchor'],
  })
  .refine((p) => p.format !== 'multistep' || (Array.isArray(p.steps) && p.steps.length >= 2), {
    message: 'steps (2..6) are required for the multistep format',
    path: ['steps'],
  })
  .refine((p) => p.afterPromoId === undefined || p.afterPromoId !== p.id, {
    message: 'afterPromoId must reference a different promo',
    path: ['afterPromoId'],
  });

export const catalogueSchema = z.array(promoSchema);

/** The pool is an array of promos. */
export const poolSchema = catalogueSchema;
/** The queue is an ordered array of promo ids. */
export const queueSchema = z.array(z.string().min(1));
export type Queue = z.infer<typeof queueSchema>;

/** Named-queues index: array of { name, persist }. */
export const queuesIndexSchema = z.array(
  z.object({ name: z.string().min(1), persist: z.boolean() }),
);
/** Per-queue object: { persist, ids }. */
export const queueObjectSchema = z.object({
  persist: z.boolean().default(false),
  ids: z.array(z.string().min(1)).default([]),
});

export type Promo = z.infer<typeof promoSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;
export type QueuesIndex = z.infer<typeof queuesIndexSchema>;
export type QueueObject = z.infer<typeof queueObjectSchema>;
