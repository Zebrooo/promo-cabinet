import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { mutateCatalogue } from '@/lib/catalogue';
import { reorderPromos, ReorderMismatchError } from '@/lib/mutations';

export const runtime = 'nodejs';

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let ids: string[];
  try {
    ids = bodySchema.parse(await req.json()).ids;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    await mutateCatalogue((promos) => reorderPromos(promos, ids));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReorderMismatchError) return NextResponse.json({ error: 'reorder_mismatch' }, { status: 400 });
    return NextResponse.json({ error: 'catalogue_unavailable' }, { status: 502 });
  }
}
