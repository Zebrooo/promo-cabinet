import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { aaEnvSchema, proxyToAaAdmin } from '@/lib/aa-admin';

export const runtime = 'nodejs';

// Поля patch — как в patchExperiment() витрины: все опциональны, каждое
// применяется независимо. rollout_pct тут — доля эксперимента (0..100),
// это НЕ канареечный процент релиза (тот в /aa/canary/pct).
const patchSchema = z.object({
  rollout_pct: z.number().min(0).max(100).optional(),
  status: z.enum(['draft', 'running', 'paused', 'completed']).optional(),
  kill_switch: z.boolean().optional(),
  surface: z.enum(['client', 'dynamic']).optional(),
  authOnly: z.boolean().optional(),
});
const bodySchema = z.object({
  env: aaEnvSchema,
  id: z.string().min(1),
  patch: patchSchema,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  return proxyToAaAdmin('/aa-admin/experiments/patch', body);
}
