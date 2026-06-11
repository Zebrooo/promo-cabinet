import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { readQueuesIndex, writeQueuesIndex, writeQueue, ensureMainQueue } from '@/lib/catalogue';

export const runtime = 'nodejs';

const createQueueBody = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-_]+$/i, 'name must be a slug (letters, digits, hyphens, underscores)'),
  persist: z.boolean(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const queues = await ensureMainQueue();
    return NextResponse.json({ queues });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof createQueueBody>;
  try {
    body = createQueueBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const index = await readQueuesIndex();
    if (index.some((q) => q.name === body.name)) {
      return NextResponse.json({ error: 'duplicate_queue' }, { status: 409 });
    }
    await writeQueue(body.name, { persist: body.persist, ids: [] });
    await writeQueuesIndex([...index, { name: body.name, persist: body.persist }]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
