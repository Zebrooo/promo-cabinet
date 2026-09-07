import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { proxyToPushAdmin } from '@/lib/push-admin';
import { pushQueueInputSchema } from '@/lib/push-campaigns';
import { isTrustedMutationOrigin, verifyAdminPassword } from '@/lib/push-mutation-guard';

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
    const body = pushQueueInputSchema.extend({ password: z.string().min(1).max(300) }).parse(await req.json());
    const { password, ...safeBody } = body;
    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'reauth_failed' }, { status: 401 });
    }
    return proxyToPushAdmin(req, '/push-admin/campaigns/queue', { id: id.data, ...safeBody });
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
}
