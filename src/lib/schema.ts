import { z } from 'zod';

export const subscriptionLevelSchema = z.enum(['none', 'plus', 'premium']);
export const promoFormatSchema = z.enum(['inline', 'popup', 'fullscreen', 'topline']);
export const audienceSchema = z.enum(['all', 'authenticated', 'anonymous']);

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
    maxImpressionsPerUser: z.number().int().positive().optional(),
    cooldownHours: z.number().int().nonnegative(),
    format: promoFormatSchema,
    title: z.string().min(1),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    action: z.object({ href: z.string().min(1), label: z.string().optional() }).optional(),
    dismissible: z.boolean().optional(),
    backgroundColor: z.string().optional(),
    textColor: z.string().optional(),
    backgroundImage: z.string().optional(),
    audience: audienceSchema.optional(),
  })
  .refine((p) => new Date(p.startsAt).getTime() < new Date(p.endsAt).getTime(), {
    message: 'startsAt must be before endsAt',
    path: ['endsAt'],
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
