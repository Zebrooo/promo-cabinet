import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { proxyToPushAdmin } from '@/lib/push-admin';
import { isTrustedMutationOrigin } from '@/lib/push-mutation-guard';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isTrustedMutationOrigin(req)) return NextResponse.json({ error: 'cross_site_request' }, { status: 403 });
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  try {
    const body = z.object({
      expectedRevision: z.number().int().nonnegative(),
      commandId: z.string().uuid(),
    }).parse(await req.json());
    return proxyToPushAdmin(req, '/push-admin/campaigns/prepare', { id: id.data, ...body });
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
}
