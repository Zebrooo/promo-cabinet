import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutatePool, mutateQueue, readQueuesIndex } from '@/lib/catalogue';
import { removePromo, updatePromo, dequeue, NotFoundError } from '@/lib/mutations';

export const runtime = 'nodejs';

type Ctx = { params: { id: string } };

export async function PUT(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let promo;
  try {
    promo = promoSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_promo' }, { status: 400 });
  }
  if (promo.id !== params.id) {
    return NextResponse.json({ error: 'id_mismatch' }, { status: 400 });
  }

  try {
    await mutatePool((promos) => updatePromo(promos, params.id, promo));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

/** Hard delete: remove from all queues, then the pool. */
export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const index = await readQueuesIndex();
    await Promise.all(
      index.map((entry) => mutateQueue(entry.name, (q) => ({ ...q, ids: dequeue(q.ids, params.id) }))),
    );
    await mutatePool((promos) => removePromo(promos, params.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
