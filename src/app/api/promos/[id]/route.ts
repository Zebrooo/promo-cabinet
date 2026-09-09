import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { promoSchema } from '@/lib/schema';
import { mutatePool, mutateQueue, readPool, readQueue, readQueuesIndex } from '@/lib/catalogue';
import { removePromo, updatePromo, dequeue, NotFoundError } from '@/lib/mutations';
import { readEnvMode } from '@/lib/env-mode';
import { withCatalogueLock } from '@/lib/catalogue-lock';
import { QUEUE_META, queueAllowsFormat } from '@/lib/queue-formats';

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

  const envMode = readEnvMode(req.cookies);
  try {
    // Проверка формата по очередям и запись пула — одной критической секцией,
    // иначе между чтением очередей и записью кто-то может поставить промо в
    // fixed-очередь другого формата.
    return await withCatalogueLock(envMode, async () => {
    const index = await readQueuesIndex(envMode);
    const fixedQueues = index.flatMap((entry) => {
      const allowedFormats = QUEUE_META[entry.name]?.servedFormats;
      return allowedFormats ? [{ queue: entry.name, allowedFormats }] : [];
    });
    const queueStates = await Promise.all(
      fixedQueues.map(async (entry) => ({ ...entry, state: await readQueue(entry.queue, envMode) })),
    );
    const incompatibleQueues = queueStates.flatMap((entry) =>
      entry.state.ids.includes(params.id) && !queueAllowsFormat(entry.queue, promo.format)
        ? [{ queue: entry.queue, allowedFormats: entry.allowedFormats }]
        : [],
    );
    if (incompatibleQueues.length > 0) {
      return NextResponse.json({
        error: 'format_not_allowed',
        promoFormat: promo.format,
        incompatibleQueues,
      }, { status: 409 });
    }

    await mutatePool((promos) => updatePromo(promos, params.id, promo), envMode);
    return NextResponse.json({ ok: true });
    });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

/** Hard delete: remove from all queues, then the pool. */
export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const envMode = readEnvMode(req.cookies);
  try {
    return await withCatalogueLock(envMode, async () => {
      // Сначала убеждаемся, что промо есть: иначе 404 прилетал бы уже после
      // частичной чистки очередей.
      const pool = await readPool(envMode);
      if (!pool.some((p) => p.id === params.id)) throw new NotFoundError(params.id);
      const index = await readQueuesIndex(envMode);
      for (const entry of index) {
        await mutateQueue(entry.name, (q) => ({ ...q, ids: dequeue(q.ids, params.id) }), envMode);
      }
      await mutatePool((promos) => removePromo(promos, params.id), envMode);
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
