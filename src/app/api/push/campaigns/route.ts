import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { proxyToPushAdmin } from '@/lib/push-admin';
import { pushDraftInputSchema } from '@/lib/push-campaigns';
import { isTrustedMutationOrigin } from '@/lib/push-mutation-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return proxyToPushAdmin(req, '/push-admin/campaigns/list', { limit: 100 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isTrustedMutationOrigin(req)) return NextResponse.json({ error: 'cross_site_request' }, { status: 403 });

  try {
    const body = pushDraftInputSchema.parse(await req.json());
    return proxyToPushAdmin(req, '/push-admin/campaigns/upsert', body);
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
}
