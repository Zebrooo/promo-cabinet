import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { aaEnvSchema, proxyToAaAdmin } from '@/lib/aa-admin';

export const runtime = 'nodejs';

// pct: 0..99 — 100% канарейки не бывает, это уже promote (см. контракт витрины).
const bodySchema = z.object({
  env: aaEnvSchema,
  pct: z.number().int().min(0).max(99),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  return proxyToAaAdmin('/aa-admin/canary/pct', body);
}
