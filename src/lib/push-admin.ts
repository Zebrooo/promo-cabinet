import { NextResponse, type NextRequest } from 'next/server';
import { pushAdminPost } from '@/lib/bff-client';
import { readEnvMode } from '@/lib/env-mode';
import { PUSH_EXPECTED_ENV_HEADER } from '@/lib/push-campaigns';

export async function proxyToPushAdmin(
  req: NextRequest,
  path: string,
  body: Record<string, unknown> = {},
  client: typeof pushAdminPost = pushAdminPost,
): Promise<NextResponse> {
  const env = readEnvMode(req.cookies);
  const expectedEnv = req.headers.get(PUSH_EXPECTED_ENV_HEADER);
  if ((expectedEnv !== 'prod' && expectedEnv !== 'test') || expectedEnv !== env) {
    return NextResponse.json({ error: 'environment_changed' }, {
      status: 409,
      headers: { 'cache-control': 'no-store' },
    });
  }
  const result = await Promise.resolve()
    .then(() => client(path, { ...body, env }))
    .catch(() => null);
  if (!result) {
    return NextResponse.json({ error: 'bff_unreachable' }, {
      status: 502,
      headers: { 'cache-control': 'no-store' },
    });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'cache-control': 'no-store' },
  });
}
