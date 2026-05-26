import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { readPool, readQueue, writeQueue, mutateQueue, readQueuesIndex, writeQueuesIndex } from '@/lib/catalogue';
import { queueKey, queuesIndexKey, getS3Client } from '@/lib/s3';
import { reorderQueue, ReorderMismatchError } from '@/lib/mutations';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '@/env';

export const runtime = 'nodejs';

type Ctx = { params: { name: string } };

const reorderBody = z.object({ ids: z.array(z.string().min(1)) });

const patchBody = z.object({
  persist: z.boolean().optional(),
  rename: z.string().min(1).regex(/^[a-z0-9-_]+$/i).optional(),
});

export async function GET(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const [queue, pool] = await Promise.all([readQueue(params.name), readPool()]);
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
    await mutateQueue(params.name, (q) => ({ ...q, ids: reorderQueue(q.ids, ids) }));
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

  try {
    const [queue, index] = await Promise.all([readQueue(params.name), readQueuesIndex()]);
    const entryIdx = index.findIndex((e) => e.name === params.name);
    if (entryIdx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    let currentName = params.name;
    let updatedQueue = { ...queue };

    if (body.persist !== undefined) {
      updatedQueue = { ...updatedQueue, persist: body.persist };
    }

    if (body.rename && body.rename !== currentName) {
      const newName = body.rename;
      if (index.some((e) => e.name === newName)) {
        return NextResponse.json({ error: 'duplicate_queue' }, { status: 409 });
      }
      // Write queue under new name and delete old key
      await writeQueue(newName, updatedQueue);
      await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey(currentName) }));
      currentName = newName;
    } else {
      await writeQueue(currentName, updatedQueue);
    }

    // Update index entry
    const newIndex = index.map((e, i) =>
      i === entryIdx ? { name: currentName, persist: updatedQueue.persist } : e,
    );
    await writeQueuesIndex(newIndex);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const index = await readQueuesIndex();
    const newIndex = index.filter((e) => e.name !== params.name);
    // Delete the queue object
    await getS3Client().send(new DeleteObjectCommand({ Bucket: env.promoBucket, Key: queueKey(params.name) })).catch(() => {});
    await writeQueuesIndex(newIndex);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
