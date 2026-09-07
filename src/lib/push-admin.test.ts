import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToPushAdmin } from './push-admin';
import { PUSH_EXPECTED_ENV_HEADER } from './push-campaigns';

describe('proxyToPushAdmin', () => {
  it('derives prod/test from the signed cabinet environment cookie, not request body', async () => {
    const mockedPost = vi.fn();
    mockedPost.mockResolvedValue({ status: 200, body: { campaigns: [] } });
    const request = new NextRequest('http://localhost/api/push/campaigns', {
      headers: { cookie: 'cab_env=test', [PUSH_EXPECTED_ENV_HEADER]: 'test' },
    });
    const response = await proxyToPushAdmin(request, '/push-admin/campaigns/list', { env: 'prod' }, mockedPost);

    expect(response.status).toBe(200);
    expect(mockedPost).toHaveBeenCalledWith('/push-admin/campaigns/list', { env: 'test' });
  });

  it('passes a structured BFF business error through unchanged', async () => {
    const mockedPost = vi.fn();
    mockedPost.mockResolvedValue({ status: 409, body: { error: 'audience_changed' } });
    const response = await proxyToPushAdmin(
      new NextRequest('http://localhost/api/push/campaigns', {
        headers: { [PUSH_EXPECTED_ENV_HEADER]: 'prod' },
      }),
      '/push-admin/campaigns/queue',
      { id: 'x' }, mockedPost,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'audience_changed' });
  });

  it('returns 502 without exposing an upstream/network error', async () => {
    const mockedPost = vi.fn();
    mockedPost.mockImplementation(() => {
      throw new Error('secret upstream detail');
    });
    const response = await proxyToPushAdmin(
      new NextRequest('http://localhost/api/push/campaigns', {
        headers: { [PUSH_EXPECTED_ENV_HEADER]: 'prod' },
      }),
      '/push-admin/campaigns/list',
      {}, mockedPost,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'bff_unreachable' });
  });

  it('rejects a stale tab when its rendered environment no longer matches the cookie', async () => {
    const mockedPost = vi.fn();
    const response = await proxyToPushAdmin(
      new NextRequest('http://localhost/api/push/campaigns', {
        headers: {
          cookie: 'cab_env=prod',
          [PUSH_EXPECTED_ENV_HEADER]: 'test',
        },
      }),
      '/push-admin/campaigns/queue',
      { id: 'x' },
      mockedPost,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'environment_changed' });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
