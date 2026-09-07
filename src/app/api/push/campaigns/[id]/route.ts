import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { proxyToPushAdmin } from '@/lib/push-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = idSchema.safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  return proxyToPushAdmin(req, '/push-admin/campaigns/get', { id: id.data });
}
