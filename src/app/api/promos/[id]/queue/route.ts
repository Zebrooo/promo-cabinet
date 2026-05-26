import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { mutateQueue, readPool } from '@/lib/catalogue';
import { enqueue, dequeue } from '@/lib/mutations';

export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

/** Add the promo to the end of the 'main' queue (must exist in the pool). */
export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const pool = await readPool();
    if (!pool.some((p) => p.id === params.id)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await mutateQueue('main', (q) => ({ ...q, ids: enqueue(q.ids, params.id) }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

/** Remove the promo from the 'main' queue (it stays in the pool). */
export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await mutateQueue('main', (q) => ({ ...q, ids: dequeue(q.ids, params.id) }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
