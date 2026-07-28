import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { readPool, mutateQueue, readQueuesIndex } from '@/lib/catalogue';
import { enqueue, dequeue } from '@/lib/mutations';
import { isFormatMismatch } from '@/lib/queue-formats';
import { readEnvMode } from '@/lib/env-mode';

export const runtime = 'nodejs';

type Ctx = { params: { name: string; id: string } };

/** Enqueue a promo into the named queue (queue must be registered in
 *  queues.json, promo must exist in the pool). Writing to an unregistered
 *  name would silently create an orphan queue-<name>.json no UI lists. */
export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const envMode = readEnvMode(req.cookies);
  try {
    const [pool, index] = await Promise.all([readPool(envMode), readQueuesIndex(envMode)]);
    if (!index.some((e) => e.name === params.name)) {
      return NextResponse.json({ error: 'queue_not_found' }, { status: 404 });
    }
    const promo = pool.find((p) => p.id === params.id);
    if (!promo) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await mutateQueue(params.name, (q) => ({ ...q, ids: enqueue(q.ids, params.id) }), envMode);
    const warning = isFormatMismatch(params.name, promo.format)
      ? `Формат «${promo.format}» не запрашивается очередью «${params.name}» — промо не будет показано сайтом`
      : undefined;
    return NextResponse.json({ ok: true, ...(warning ? { warning } : {}) });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

/** Dequeue a promo from the named queue (idempotent). */
export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    await mutateQueue(params.name, (q) => ({ ...q, ids: dequeue(q.ids, params.id) }), readEnvMode(req.cookies));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
