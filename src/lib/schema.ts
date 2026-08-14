import { z } from 'zod';
import { KNOWN_CUSTOM_VARIANTS } from './custom-variants';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline', 'divkit', 'tooltip', 'multistep', 'custom']);
export const promoFormats = promoFormatSchema.options;
export type PromoFormat = z.infer<typeof promoFormatSchema>;
export const audienceSchema = z.enum(['all', 'authenticated', 'anonymous']);
export const deviceTargetSchema = z.enum(['desktop', 'touch', 'both']);

function hasTwoNormalizedSearchCharacters(value: string): boolean {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .length >= 2;
}

export const searchTargetingSchema = z.object({
  terms: z
    .array(
      z
        .string()
        .trim()
        .min(2, 'Поисковая фраза — не короче 2 символов')
        .max(80, 'Поисковая фраза — не длиннее 80 символов')
        .regex(/[\p{L}\p{N}]/u, 'Поисковая фраза должна содержать букву или цифру')
        .refine(
          hasTwoNormalizedSearchCharacters,
          'После нормализации в поисковой фразе должно остаться не меньше 2 букв или цифр',
        ),
    )
    .max(20, 'Не больше 20 поисковых фраз')
    .optional(),
  sections: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Раздел поиска не может быть пустым')
        .max(40, 'Раздел поиска — не длиннее 40 символов')
        .regex(/[\p{L}\p{N}]/u, 'Раздел поиска должен содержать букву или цифру'),
    )
    .max(20, 'Не больше 20 разделов поиска')
    .optional(),
  match: z.enum(['any', 'all']).optional(),
  lookbackDays: z
    .number()
    .int('Период поиска должен быть целым числом дней')
    .min(1, 'Период поиска — не меньше 1 дня')
    .max(30, 'Период поиска — не больше 30 дней')
    .optional(),
});

export const packTypeSchema = z.enum(['bump', 'premium', 'vip']);

export const purchasesTargetingSchema = z.object({
  purchased: z.boolean().optional(),
  minTotalKopecks: z.number().int().nonnegative('Сумма не может быть отрицательной').optional(),
  maxTotalKopecks: z.number().int().nonnegative('Сумма не может быть отрицательной').optional(),
  minCount: z.number().int().nonnegative('Количество не может быть отрицательным').optional(),
  maxCount: z.number().int().nonnegative('Количество не может быть отрицательным').optional(),
  packTypes: z.array(packTypeSchema).optional(),
  lookbackDays: z
    .number()
    .int('Период должен быть целым числом дней')
    .min(1, 'Период — не меньше 1 дня')
    .max(365, 'Период — не больше 365 дней')
    .optional(),
});

export const balanceTargetingSchema = z.object({
  currentAbove: z.number().int().optional(),
  currentBelow: z.number().int().optional(),
  movementAbove: z.number().int().optional(),
  movementBelow: z.number().int().optional(),
  movementLookbackDays: z
    .number()
    .int('Период должен быть целым числом дней')
    .min(1, 'Период — не меньше 1 дня')
    .max(365, 'Период — не больше 365 дней')
    .optional(),
});

/** Байт-в-байт с listingsTargetingSchema в catalogue-schema.ts BFF
 *  (promo-bff, уже смержено в его main). Оба репозитория валидируют одну и
 *  ту же JSON-форму независимо. */
export const listingsTargetingSchema = z.object({
  categories: z.array(z.string().min(1, 'Категория не может быть пустой')).optional(),
  categoriesMatch: z.enum(['any', 'all']).optional(),
  activeCategories: z.array(z.string().min(1, 'Активная категория не может быть пустой')).optional(),
  hasUnpromotedActive: z.boolean().optional(),
  inactiveDays: z.number().int().nonnegative('Число дней не может быть отрицательным').optional(),
});
/** Линейный градиент для popup/fullscreen/sheet — каскадом с image/color
 *  (см. composeOverlayBackground в @zebrooo/promo-renderer). */
export const backgroundGradientSchema = z.object({
  from:  z.string().min(1, 'Укажите начальный цвет градиента'),
  to:    z.string().min(1, 'Укажите конечный цвет градиента').optional(),
  angle: z.number().min(0, 'Угол не может быть меньше 0').max(360, 'Угол не может быть больше 360').optional(),
});

/** Выравнивание текста в overlay-форматах. Только горизонтальное — для
 *  вертикального renderer уже сам центрирует через flex. */
export const textAlignSchema = z.enum(['left', 'center', 'right']);

/** Multistep only: режим показа визарда. `modal` (default) — центрированный
 *  диалог поверх backdrop; `fullscreen` — диалог на весь вьюпорт
 *  (zr-multistep--fullscreen в @zebrooo/promo-renderer, с 0.11.0). */
export const presentationSchema = z.enum(['modal', 'fullscreen']);

/** Один шаг multistep-визарда: заголовок + текст. Лимиты повторяют
 *  wizard-steps.ts на storefront (title ≤ 80, body ≤ 240) — что не влезло,
 *  web всё равно обрежет, поэтому честнее не пустить на этапе формы.
 *  imageUrl — опциональная картинка/гифка шага (http(s)-URL ≤ 1024):
 *  рендерится в зоне сцены MultistepPromo приоритетнее хост-слота
 *  multistepStage (@zebrooo/promo-renderer 0.12.0); если пусто — на сайте
 *  показывается анимированная сцена хоста. Байт-в-байт с catalogue-schema.ts
 *  BFF. */
export const promoStepSchema = z.object({
  title: z.string().min(1, 'Укажите заголовок шага').max(80, 'Заголовок шага — не длиннее 80 символов'),
  body:  z.string().min(1, 'Укажите текст шага').max(240, 'Текст шага — не длиннее 240 символов'),
  imageUrl: z.string().url('Некорректный URL картинки').max(1024, 'URL картинки — не длиннее 1024 символов').optional(),
});

/**
 * Слой 1: общий "serving"-блок — таргетинг/расписание/частота показов,
 * одинаковый для всех 8 форматов. Именно эти поля BFF использует для отбора
 * кандидата ДО рендера контента, поэтому они живут отдельно от контентных
 * полей конкретного формата (слой 2, ниже).
 *
 * title обязателен ВЕЗДЕ, включая divkit/multistep/custom — это часть
 * контракта BFF (список/логи промо всегда показывают title), даже если сам
 * рендерер формата title не читает.
 */
export const servingBlockSchema = z.object({
  id: z.string().min(1, 'Укажите id'),
  name: z.string().min(1, 'Укажите название'),
  title: z.string().min(1, 'Укажите заголовок'),
  startsAt: z.string().datetime({ message: 'Некорректная дата начала' }),
  endsAt: z.string().datetime({ message: 'Некорректная дата окончания' }),
  targeting: z.object({
    minAge: z.number().int().nonnegative('Возраст не может быть отрицательным').optional(),
    maxAge: z.number().int().nonnegative('Возраст не может быть отрицательным').optional(),
    regions: z.array(z.string()).optional(),
    subscriptionLevels: z.array(subscriptionLevelSchema).optional(),
    search: searchTargetingSchema.optional(),
    purchases: purchasesTargetingSchema.optional(),
    balance: balanceTargetingSchema.optional(),
    listings: listingsTargetingSchema.optional(),
  }),
  // Optional per-user cap. Legacy data used 0 = unlimited; coerce that to
  // undefined (the new "unlimited") so old catalogues still parse.
  maxImpressionsPerUser: z.preprocess(
    (v) => (v === 0 ? undefined : v),
    z.number().int().positive('Значение должно быть больше 0').optional(),
  ),
  cooldownHours: z.number().int().nonnegative('Часы не могут быть отрицательными'),
  /** Цепочка показов: id промо-предшественника. Промо с этим полем BFF
   *  отдаёт только после зафиксированного показа предшественника
   *  (ChainChecker). Ограничения побайтово те же, что в catalogue-schema.ts
   *  BFF. Санити afterPromoId !== id — superRefine на promoSchema. */
  afterPromoId: z.string().min(1, 'afterPromoId не может быть пустым').max(64, 'afterPromoId — не длиннее 64 символов').optional(),
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
});

/** Общий шейп CTA-кнопки — расшаривается через `.extend()` форматами, у
 *  которых рендерер реально читает action/ctaColor/ctaTextColor
 *  (inline/popup/fullscreen/tooltip/multistep). Не самостоятельная схема члена union —
 *  только объект полей для extend. */
const ctaBlockShape = {
  action: z.object({
    href: z.string().min(1, 'Укажите ссылку'),
    label: z.string().optional(),
  }).optional(),
  /** Цвет CTA-кнопки (background). Если пусто — дефолт renderer'а
   *  (тёмно-красный). textColor отдельно — для контента, не кнопки. */
  ctaColor: z.string().optional(),
  /** Цвет текста на CTA-кнопке. Если пусто — белый. */
  ctaTextColor: z.string().optional(),
};

/** Общий шейп overlay-контента popup/fullscreen — идентичен у обоих
 *  форматов, вынесен в константу, чтобы не копипастить между членами union. */
const overlayContentShape = {
  description: z.string().optional(),
  imageUrl: z.string().url('Некорректный URL картинки').optional(),
  dismissible: z.boolean().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundGradient: backgroundGradientSchema.optional(),
  /** Горизонтальное выравнивание контента (title + description). */
  textAlign: textAlignSchema.optional(),
  ...ctaBlockShape,
};

/** Слой 2, член 1/8: inline. БЕЗ backgroundGradient — рендерер inline его не
 *  читает. */
export const inlinePromoSchema = servingBlockSchema.extend({
  format: z.literal('inline'),
  description: z.string().optional(),
  imageUrl: z.string().url('Некорректный URL картинки').optional(),
  textAlign: textAlignSchema.optional(),
  ...ctaBlockShape,
});

/** Слой 2, член 2/8: topline. Урезанный контент — рендерер topline не читает
 *  imageUrl/ctaColor/ctaTextColor/backgroundGradient/textAlign, а action без
 *  label (topline не рисует подпись кнопки). */
export const toplinePromoSchema = servingBlockSchema.extend({
  format: z.literal('topline'),
  description: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  action: z.object({ href: z.string().min(1, 'Укажите ссылку') }).optional(),
});

/** Слой 2, член 3/8: popup. */
export const popupPromoSchema = servingBlockSchema.extend({
  format: z.literal('popup'),
  ...overlayContentShape,
});

/** Слой 2, член 4/8: fullscreen. Контент идентичен popup (тот же
 *  overlayContentShape) — отличается только literal формата. */
export const fullscreenPromoSchema = servingBlockSchema.extend({
  format: z.literal('fullscreen'),
  ...overlayContentShape,
});

/** Слой 2, член 5/8: tooltip. anchor — id якоря из CANONICAL_ANCHORS, к
 *  элементу которого привязан пузырёк (хост помечает элемент
 *  data-promo-anchor="<id>"). Теперь обязательное поле схемы члена —
 *  отдельный refine больше не нужен. БЕЗ backgroundImage/backgroundGradient
 *  (рендерер tooltip их не читает). */
export const tooltipPromoSchema = servingBlockSchema.extend({
  format: z.literal('tooltip'),
  anchor: z.string().min(1, 'Укажите якорь'),
  description: z.string().optional(),
  imageUrl: z.string().url('Некорректный URL картинки').optional(),
  dismissible: z.boolean().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  textAlign: textAlignSchema.optional(),
  ...ctaBlockShape,
});

/** Слой 2, член 6/8: multistep. steps — обязательное поле (2..6 шагов),
 *  отдельный refine больше не нужен. action рендерится CTA-кнопкой
 *  на последнем шаге; цвета кнопки тоже читаются рендерером. */
export const multistepPromoSchema = servingBlockSchema.extend({
  format: z.literal('multistep'),
  steps: z.array(promoStepSchema).min(2, 'Нужно минимум 2 шага').max(6, 'Не больше 6 шагов'),
  /** Режим показа — модалка (default) или во весь экран. */
  presentation: presentationSchema.optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundGradient: backgroundGradientSchema.optional(),
  ...ctaBlockShape,
});

/** Слой 2, член 7/8: divkit. divkitUrl — URL на JSON-верстку в S3
 *  (production-вариант), опционален в storage-схеме — обязательность
 *  проверяется на форме. divkitJson — транзитное inline JSON для preview ДО
 *  сохранения промо; при save кабинет улетит им в S3, заполнит divkitUrl,
 *  обнулит это поле. В prod-S3 промо НЕ содержит divkitJson. */
export const divkitPromoSchema = servingBlockSchema.extend({
  format: z.literal('divkit'),
  divkitUrl: z.string().url('Некорректный URL верстки').optional(),
  divkitJson: z.unknown().optional(),
});

/** Поля варианта `referral-invite` — конфиг реферальной программы, который
 *  promo-bff зеркалит (best-effort upsert) в abkhaz-Supabase `referral_config`
 *  (singleton id=1). Хранятся/передаются в КОПЕЙКАХ (как price_kopecks в
 *  abkhaz) — форма конвертирует ₽↔копейки на вводе/выводе, здесь всегда целые
 *  копейки. Все поля optional на уровне схемы, т.к. они специфичны для этого
 *  одного варианта и должны молча стриптись у остальных custom-промо (union
 *  member остаётся общим для всех custom-вариантов — различать по `variant`
 *  на уровне формы/BFF, не заводить под каждый вариант свой член union). */
const referralInviteShape = {
  referralActive: z.boolean().optional(),
  referralInviterCreditKopecks: z.number().int('Только целое число копеек').nonnegative('Не может быть отрицательным').optional(),
  referralSellerBonusKopecks: z.number().int('Только целое число копеек').nonnegative('Не может быть отрицательным').optional(),
  referralDailyInviteCap: z.number().int('Только целое число').positive('Должно быть больше 0').optional(),
  referralHoldHours: z.number().int('Только целое число часов').nonnegative('Не может быть отрицательным').optional(),
  /** referral_config.daily_budget_kopecks — дневной бюджет программы, копейки.
   *  Дефолт БД 100000 (1000₽/день); optional здесь как остальные referral*
   *  поля — при отсутствии BFF применит дефолт сам. */
  dailyBudgetKopecks: z.number().int('Только целое число копеек').nonnegative('Не может быть отрицательным').optional(),
};

/** Слой 2, член 8/8: custom. variant — id варианта host-side рендер-функции
 *  из KNOWN_CUSTOM_VARIANTS; field-level refine (не object-level!) — того
 *  требует z.discriminatedUnion в zod 3.23: сам объект члена обязан
 *  остаться чистым ZodObject, а не ZodEffects. */
export const customPromoSchema = servingBlockSchema.extend({
  format: z.literal('custom'),
  variant: z
    .string()
    .min(1, 'Укажите вариант')
    .max(64, 'Вариант — не длиннее 64 символов')
    .refine((v) => KNOWN_CUSTOM_VARIANTS.some((kv) => kv.id === v), {
      message: 'Вариант не зарегистрирован в KNOWN_CUSTOM_VARIANTS',
    }),
  dismissible: z.boolean().optional(),
  ...referralInviteShape,
});

/**
 * Validation source of truth for a promo. MUST match abhPromo's catalogue-schema.ts.
 *
 * discriminatedUnion по `format` — каждый член строит контент своего формата
 * поверх общего serving-блока (слой 1). zod-объекты нестрогие: лишние ключи
 * молча вырезаются (strip), это ЖЕЛАЕМОЕ поведение — readPool (catalogue.ts)
 * лениво пропускает невалидные промо, а mutatePool пишет назад отфильтрованный
 * пул, так что НИ ОДНОГО .strict() здесь быть не должно (иначе промо, которое
 * сегодня валидно, при следующем read-modify-write молча исчезнет из S3).
 */
export const promoSchema = z
  .discriminatedUnion('format', [
    inlinePromoSchema,
    toplinePromoSchema,
    popupPromoSchema,
    fullscreenPromoSchema,
    tooltipPromoSchema,
    multistepPromoSchema,
    divkitPromoSchema,
    customPromoSchema,
  ])
  .superRefine((p, ctx) => {
    if (new Date(p.startsAt).getTime() >= new Date(p.endsAt).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Дата начала должна быть раньше даты окончания', path: ['endsAt'] });
    }
    if (p.afterPromoId !== undefined && p.afterPromoId === p.id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'afterPromoId должен ссылаться на другое промо', path: ['afterPromoId'] });
    }
  });

/**
 * Плоский супернабор всех полей всех форматов, БЕЗ refine-ов. Используется
 * только как источник типа состояния формы (Formik держит в стейте все поля
 * сразу, независимо от текущего format) — сама валидация данных всегда идёт
 * через promoSchema (discriminated union выше).
 */
export const promoDraftSchema = servingBlockSchema.extend({
  format: promoFormatSchema,
  description: z.string().optional(),
  imageUrl: z.string().url('Некорректный URL картинки').optional(),
  ...ctaBlockShape,
  backgroundColor: z.string().optional(),
  backgroundGradient: backgroundGradientSchema.optional(),
  textColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  textAlign: textAlignSchema.optional(),
  divkitUrl: z.string().url('Некорректный URL верстки').optional(),
  divkitJson: z.unknown().optional(),
  anchor: z.string().min(1).optional(),
  steps: z.array(promoStepSchema).min(2).max(6).optional(),
  presentation: presentationSchema.optional(),
  variant: z.string().min(1).max(64).optional(),
  dismissible: z.boolean().optional(),
  ...referralInviteShape,
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

/** Плоский тип состояния формы — импортёры (компоненты, catalogue.ts,
 *  mutations.ts, API-роуты) продолжают работать с одним плоским типом,
 *  независимо от того, что валидация ушла на discriminated union. */
export type Promo = z.infer<typeof promoDraftSchema>;
export type Catalogue = z.infer<typeof catalogueSchema>;
export type QueuesIndex = z.infer<typeof queuesIndexSchema>;
export type QueueObject = z.infer<typeof queueObjectSchema>;

/** Компайл-тайм проверка: каждый член union структурно присваивается
 *  плоскому Promo (форма может держать промо любого формата в одном
 *  стейте). Если у члена появится поле, несовместимое с promoDraftSchema,
 *  сборка упадёт здесь, а не где-то в PromoForm. */
/* eslint-disable @typescript-eslint/no-unused-vars */
const _inlineAssignable: Promo = {} as z.infer<typeof inlinePromoSchema>;
const _toplineAssignable: Promo = {} as z.infer<typeof toplinePromoSchema>;
const _popupAssignable: Promo = {} as z.infer<typeof popupPromoSchema>;
const _fullscreenAssignable: Promo = {} as z.infer<typeof fullscreenPromoSchema>;
const _tooltipAssignable: Promo = {} as z.infer<typeof tooltipPromoSchema>;
const _multistepAssignable: Promo = {} as z.infer<typeof multistepPromoSchema>;
const _divkitAssignable: Promo = {} as z.infer<typeof divkitPromoSchema>;
const _customAssignable: Promo = {} as z.infer<typeof customPromoSchema>;
/* eslint-enable @typescript-eslint/no-unused-vars */

/** format → соответствующий член discriminated union. Формы/компоненты
 *  могут дёрнуть конкретную схему формата напрямую (например для
 *  per-field валидации в Formik), не завязываясь на весь promoSchema. */
export const SCHEMA_BY_FORMAT: Record<PromoFormat, z.ZodObject<any>> = {
  inline: inlinePromoSchema,
  topline: toplinePromoSchema,
  popup: popupPromoSchema,
  fullscreen: fullscreenPromoSchema,
  tooltip: tooltipPromoSchema,
  multistep: multistepPromoSchema,
  divkit: divkitPromoSchema,
  custom: customPromoSchema,
};

const servingKeys = new Set<string>([...Object.keys(servingBlockSchema.shape), 'format']);

/** format → контентные ключи формата (ключи члена union МИНУС serving-ключи
 *  слоя 1). Используется формой, чтобы решить, какие поля показывать/
 *  сохранять для выбранного формата. */
export const CONTENT_KEYS_BY_FORMAT: Record<PromoFormat, readonly string[]> = Object.fromEntries(
  Object.entries(SCHEMA_BY_FORMAT).map(([format, schema]) => [
    format,
    Object.keys(schema.shape).filter((key) => !servingKeys.has(key)),
  ]),
) as unknown as Record<PromoFormat, readonly string[]>;
