import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { readPool, readQueue, writeQueue, mutateQueue, readQueuesIndex, writeQueuesIndex, PROD_SERVED_QUEUES } from '@/lib/catalogue';
import { queueKey, getS3Client } from '@/lib/s3';
import { reorderQueue, ReorderMismatchError } from '@/lib/mutations';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';
import { readEnvMode } from '@/lib/env-mode';

export const runtime = 'nodejs';

type Ctx = { params: { name: string } };

const reorderBody = z.object({ ids: z.array(z.string().min(1)) });

const patchBody = z.object({
  persist: z.boolean().optional(),
  rename: z.string().min(1).regex(/^[a-z0-9-_]+$/i).optional(),
});

/** 409 body for delete/rename of a queue that production still requests. */
function prodServedConflict(): NextResponse {
  return NextResponse.json(
    {
      error: 'prod_served_queue',
      message: 'Очередь обслуживает прод; storefront должен перестать её запрашивать до удаления или переименования.',
    },
    { status: 409 },
  );
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const envMode = readEnvMode(req.cookies);
    const [queue, pool] = await Promise.all([readQueue(params.name, envMode), readPool(envMode)]);
    const byId = new Map(pool.map((p) => [p.id, p]));
    // Resolve ids to promos, skipping dangling ids
    const promos = queue.ids.map((id) => byId.get(id)).filter(Boolean);
    return NextResponse.json({ persist: queue.persist, ids: queue.ids, promos });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let ids: string[];
  try {
    ids = reorderBody.parse(await req.json()).ids;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    // Reordering an unregistered name would silently create an orphan
    // queue-<name>.json no UI lists — refuse instead.
    const envMode = readEnvMode(req.cookies);
    const index = await readQueuesIndex(envMode);
    if (!index.some((e) => e.name === params.name)) {
      return NextResponse.json({ error: 'queue_not_found' }, { status: 404 });
    }
    await mutateQueue(params.name, (q) => ({ ...q, ids: reorderQueue(q.ids, ids) }), envMode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReorderMismatchError) return NextResponse.json({ error: 'reorder_mismatch' }, { status: 400 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof patchBody>;
  try {
    body = patchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const envMode = readEnvMode(req.cookies);
  try {
    const [queue, index] = await Promise.all([readQueue(params.name, envMode), readQueuesIndex(envMode)]);
    const entryIdx = index.findIndex((e) => e.name === params.name);
    if (entryIdx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const currentName = params.name;
    let updatedQueue = { ...queue };

    if (body.persist !== undefined) {
      updatedQueue = { ...updatedQueue, persist: body.persist };
    }

    if (body.rename && body.rename !== currentName) {
      if (PROD_SERVED_QUEUES.includes(currentName)) return prodServedConflict();
      const newName = body.rename;
      if (index.some((e) => e.name === newName)) {
        return NextResponse.json({ error: 'duplicate_queue' }, { status: 409 });
      }
      const oldName = currentName;
      // Safer ordering: (a) write queue under the new key, (b) write the
      // updated index pointing to the new name, (c) delete the old key last.
      // A failure after (b) leaves only a harmless orphaned old key.
      await writeQueue(newName, updatedQueue, envMode);
      const newIndex = index.map((e, i) =>
        i === entryIdx ? { name: newName, persist: updatedQueue.persist } : e,
      );
      await writeQueuesIndex(newIndex, envMode);
      await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey(oldName, envMode) }));

      return NextResponse.json({ ok: true });
    }

    await writeQueue(currentName, updatedQueue, envMode);
    // Update index entry
    const newIndex = index.map((e, i) =>
      i === entryIdx ? { name: currentName, persist: updatedQueue.persist } : e,
    );
    await writeQueuesIndex(newIndex, envMode);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const envMode = readEnvMode(req.cookies);
  try {
    if (PROD_SERVED_QUEUES.includes(params.name)) return prodServedConflict();
    const index = await readQueuesIndex(envMode);
    if (!index.some((e) => e.name === params.name)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const newIndex = index.filter((e) => e.name !== params.name);
    await writeQueuesIndex(newIndex, envMode);
    // Delete the queue object. The queue is already out of the index, so a
    // failure here only leaves a harmless orphaned queue-<name>.json — but
    // don't swallow it silently: surface a warning to the caller.
    try {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey(params.name, envMode) }));
    } catch {
      return NextResponse.json({
        ok: true,
        warning: `Очередь убрана из списка, но объект queue-${params.name}.json удалить не удалось — он останется в хранилище.`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
