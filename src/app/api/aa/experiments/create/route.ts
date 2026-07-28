import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { aaEnvSchema, proxyToAaAdmin } from '@/lib/aa-admin';

export const runtime = 'nodejs';

// Зеркалит валидацию createExperiment() витрины (actions.ts): kebab-ключ,
// surface из фиксированного набора, минимум 2 варианта с одним control —
// финальную проверку всё равно делает BFF/Supabase, но явный 400 тут даёт
// админу быструю обратную связь без похода до сети.
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const variantSchema = z.object({
  key: z.string().min(1),
  weight: z.number(),
  is_control: z.boolean(),
  position: z.number(),
});
const bodySchema = z.object({
  env: aaEnvSchema,
  key: z.string().regex(KEY_RE),
  title: z.string().min(1),
  surface: z.enum(['client', 'dynamic']),
  variants: z.array(variantSchema).min(2),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (!body.variants.some((v) => v.is_control)) {
    return NextResponse.json({ error: 'no_control_variant' }, { status: 400 });
  }

  return proxyToAaAdmin('/aa-admin/experiments/create', body);
}
