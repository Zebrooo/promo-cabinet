import { z } from 'zod';
import type { EnvMode } from './env-mode';

export const PUSH_TITLE_MAX = 120;
export const PUSH_BODY_MAX = 300;
export const PUSH_EXPECTED_ENV_HEADER = 'x-push-expected-env';

export function withPushExpectedEnv(
  env: EnvMode,
  init: RequestInit = {},
): RequestInit {
  const headers = new Headers(init.headers);
  headers.set(PUSH_EXPECTED_ENV_HEADER, env);
  return { ...init, headers };
}

/** Keeps a command id stable while an HTTP outcome is ambiguous. The database
 * stores the response under this id, so retrying cannot repeat the mutation. */
export class PushCommandRegistry {
  private readonly pending = new Map<string, string>();

  constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

  acquire(key: string): string {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const commandId = this.createId();
    this.pending.set(key, commandId);
    return commandId;
  }

  complete(key: string): void {
    this.pending.delete(key);
  }
}

export function pushCommandKey(
  operation: 'upsert' | 'prepare' | 'queue' | 'cancel',
  payload: Record<string, unknown>,
): string {
  return `${operation}:${JSON.stringify(payload)}`;
}

type PushMutationErrorLike = {
  code?: unknown;
  status?: unknown;
};

/**
 * A gateway/server error can arrive after the durable RPC has committed. Keep
 * the command id in that case so replay returns the stored response instead of
 * performing a second mutation.
 */
export function isAmbiguousPushMutationError(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return true;
  const { code, status } = reason as PushMutationErrorLike;
  if (code === 'bff_unreachable' || code === 'push_admin_unavailable') return true;
  if (typeof status !== 'number') return true;
  return status === 408 || status === 429 || status >= 500;
}

export async function runIdempotentPushCommand<T>({
  registry,
  key,
  request,
  reconcile,
}: {
  registry: PushCommandRegistry;
  key: string;
  request: (commandId: string) => Promise<T>;
  reconcile: () => Promise<unknown>;
}): Promise<T> {
  const commandId = registry.acquire(key);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await request(commandId);
      registry.complete(key);
      return result;
    } catch (reason) {
      lastError = reason;
      if (!isAmbiguousPushMutationError(reason)) {
        registry.complete(key);
        throw reason;
      }
      await reconcile().catch(() => undefined);
    }
  }

  throw lastError;
}

export const pushAudienceModeSchema = z.enum(['marketing_opt_in', 'offline_consent']);
export type PushAudienceMode = z.infer<typeof pushAudienceModeSchema>;

export const pushCampaignStatusSchema = z.enum([
  'draft',
  'prepared',
  'scheduled',
  'running',
  'cancel_requested',
  'completed',
  'completed_with_failures',
  'cancelled',
  'failed',
]);
export type PushCampaignStatus = z.infer<typeof pushCampaignStatusSchema>;

const internalPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^\/(?!\/)/, 'Укажите внутренний путь, например /zapros')
  .refine((value) => !value.includes('\\'), 'Обратный слеш недопустим')
  .refine((value) => {
    try {
      const url = new URL(value, 'https://abkhaz-auto.ru');
      return url.origin === 'https://abkhaz-auto.ru';
    } catch {
      return false;
    }
  }, 'Допустим только внутренний путь Abkhaz Auto');

export const pushDraftInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    commandId: z.string().uuid(),
    dedupKey: z
      .string()
      .trim()
      .min(3)
      .max(96)
      .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Используйте строчные латинские буквы, цифры, точку, дефис или _'),
    title: z.string().trim().min(1).max(PUSH_TITLE_MAX),
    body: z.string().trim().min(1).max(PUSH_BODY_MAX),
    path: internalPathSchema,
    audienceMode: pushAudienceModeSchema,
    consentBasis: z.string().trim().max(300).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    maxRecipients: z.number().int().min(1).max(500_000),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.id && value.expectedRevision === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedRevision'],
        message: 'Для обновления нужен номер версии кампании',
      });
    }
    if (value.audienceMode === 'offline_consent' && (value.consentBasis?.length ?? 0) < 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consentBasis'],
        message: 'Укажите основание офлайн-согласия (не короче 12 символов)',
      });
    }
  });

export const pushQueueInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  commandId: z.string().uuid(),
  expectedEligibleUsers: z.number().int().positive(),
  maxRecipients: z.number().int().positive().max(500_000),
  expectedAudienceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmation: z.string().trim().regex(/^\d+$/),
});

export interface PushCampaign {
  id: string;
  revision: number;
  dedupKey: string;
  title: string;
  body: string;
  path: string;
  audienceMode: PushAudienceMode;
  consentBasis: string | null;
  status: PushCampaignStatus;
  scheduledAt: string | null;
  maxRecipients: number;
  createdAt: string;
  updatedAt: string;
  preparedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  eligibleUsers: number | null;
  candidateTokens: number | null;
  audienceDigest: string | null;
  payloadHash: string | null;
  accepted: number;
  skipped: number;
  failed: number;
  unknown: number;
  cancelledCount: number;
  createdBy: string;
  exclusions?: {
    explicitOptOut?: number;
    banned?: number;
    deleted?: number;
    noMobileToken?: number;
  };
  error?: string | null;
}

export interface PushWorkerStatus {
  enabled: boolean;
  healthy: boolean;
  lastHeartbeatAt?: string | null;
}

export interface PushCampaignListResponse {
  campaigns: PushCampaign[];
  worker: PushWorkerStatus;
}

export function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  // Product scheduling is explicitly shown in Asia/Tbilisi. Georgia has used
  // UTC+04 without daylight saving since 2005, so the conversion is stable
  // and independent of the operator browser/server timezone.
  const timestamp = new Date(`${value}:00+04:00`);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

export function isoToTbilisiLocal(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function campaignCanPrepare(status: PushCampaignStatus): boolean {
  return status === 'draft' || status === 'prepared';
}

export function campaignCanCancel(status: PushCampaignStatus): boolean {
  return status === 'draft'
    || status === 'prepared'
    || status === 'scheduled'
    || status === 'running'
    || status === 'cancel_requested';
}
