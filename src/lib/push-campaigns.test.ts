import { describe, expect, it } from 'vitest';
import {
  campaignCanCancel,
  isoToTbilisiLocal,
  localDateTimeToIso,
  isAmbiguousPushMutationError,
  pushDraftInputSchema,
  PushCommandRegistry,
  pushCommandKey,
  pushQueueInputSchema,
  runIdempotentPushCommand,
  withPushExpectedEnv,
} from './push-campaigns';

const valid = {
  commandId: '6d01eb53-17e9-4405-a71c-c54af8fd5da1',
  dedupKey: 'parts-rfq-september',
  title: 'Найдём запчасть',
  body: 'Магазины сами пришлют цены.',
  path: '/zapros',
  audienceMode: 'marketing_opt_in' as const,
  scheduledAt: null,
  maxRecipients: 20_000,
};

describe('push campaign validation', () => {
  it('accepts a safe internal destination and explicit opt-in audience', () => {
    expect(pushDraftInputSchema.parse(valid)).toMatchObject(valid);
  });

  it.each(['https://evil.example/x', '//evil.example/x', 'zapros', '/\\evil'])('rejects unsafe destination %s', (path) => {
    expect(pushDraftInputSchema.safeParse({ ...valid, path }).success).toBe(false);
  });

  it('requires a recorded basis for the offline-consent audience', () => {
    const result = pushDraftInputSchema.safeParse({
      ...valid,
      audienceMode: 'offline_consent',
      consentBasis: 'office',
    });
    expect(result.success).toBe(false);
  });

  it('requires optimistic-lock revision when updating an existing draft', () => {
    expect(pushDraftInputSchema.safeParse({
      ...valid,
      id: '1425fbaa-d27b-42bd-a823-a18f4e2f9d49',
    }).success).toBe(false);
    expect(pushDraftInputSchema.safeParse({
      ...valid,
      id: '1425fbaa-d27b-42bd-a823-a18f4e2f9d49',
      expectedRevision: 3,
    }).success).toBe(true);
  });

  it('requires all three exact launch latches', () => {
    const digest = 'a'.repeat(64);
    expect(pushQueueInputSchema.safeParse({
      expectedRevision: 2,
      commandId: '6d01eb53-17e9-4405-a71c-c54af8fd5da1',
      expectedEligibleUsers: 15826,
      maxRecipients: 20_000,
      expectedAudienceDigest: digest,
      expectedPayloadHash: digest,
      confirmation: '15826',
    }).success).toBe(true);
    expect(pushQueueInputSchema.safeParse({
      expectedRevision: 2,
      commandId: '6d01eb53-17e9-4405-a71c-c54af8fd5da1',
      expectedEligibleUsers: 15826,
      maxRecipients: 20_000,
      expectedAudienceDigest: 'short',
      expectedPayloadHash: digest,
      confirmation: 'yes',
    }).success).toBe(false);
  });

  it('only allows cancellation while a campaign is nonterminal', () => {
    expect(campaignCanCancel('draft')).toBe(true);
    expect(campaignCanCancel('prepared')).toBe(true);
    expect(campaignCanCancel('scheduled')).toBe(true);
    expect(campaignCanCancel('running')).toBe(true);
    expect(campaignCanCancel('completed')).toBe(false);
  });

  it('converts a valid local datetime and rejects nonsense', () => {
    expect(localDateTimeToIso('2026-09-08T11:00')).toBe('2026-09-08T07:00:00.000Z');
    expect(isoToTbilisiLocal('2026-09-08T07:00:00.000Z')).toBe('2026-09-08T11:00');
    expect(localDateTimeToIso('not-a-date')).toBeNull();
  });

  it('pins every browser request to the environment rendered into the page', () => {
    const init = withPushExpectedEnv('test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-push-expected-env')).toBe('test');
  });

  it('reuses a command id after an ambiguous response and rotates it only after completion', () => {
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const registry = new PushCommandRegistry(() => ids.shift() ?? 'unexpected');
    const key = pushCommandKey('queue', { campaignId: 'campaign', revision: 3 });

    expect(registry.acquire(key)).toBe('11111111-1111-4111-8111-111111111111');
    expect(registry.acquire(key)).toBe('11111111-1111-4111-8111-111111111111');
    registry.complete(key);
    expect(registry.acquire(key)).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('replays a committed command with the same id after the BFF returns 502', async () => {
    const registry = new PushCommandRegistry(() => '11111111-1111-4111-8111-111111111111');
    const commandIds: string[] = [];
    let attempts = 0;
    let reconciliations = 0;

    const result = await runIdempotentPushCommand({
      registry,
      key: pushCommandKey('queue', { campaignId: 'campaign', revision: 3 }),
      request: async (commandId) => {
        commandIds.push(commandId);
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('response lost after commit'), {
            code: 'push_admin_unavailable',
            status: 502,
          });
        }
        return { status: 'scheduled' };
      },
      reconcile: async () => { reconciliations += 1; },
    });

    expect(result).toEqual({ status: 'scheduled' });
    expect(commandIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(reconciliations).toBe(1);
    expect(isAmbiguousPushMutationError({ code: 'validation_error', status: 400 })).toBe(false);
  });
});
