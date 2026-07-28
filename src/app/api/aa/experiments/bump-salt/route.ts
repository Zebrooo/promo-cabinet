import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { aaEnvSchema, proxyToAaAdmin } from '@/lib/aa-admin';

export const runtime = 'nodejs';

const bodySchema = z.object({
  env: aaEnvSchema,
  id: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  return proxyToAaAdmin('/aa-admin/experiments/bump-salt', body);
}
