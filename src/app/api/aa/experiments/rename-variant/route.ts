import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isAuthed } from '@/lib/api-auth';
import { aaEnvSchema, proxyToAaAdmin } from '@/lib/aa-admin';

export const runtime = 'nodejs';

// Как renameVariant() витрины: kebab-ключ, "control" разрешён отдельно
// (control исторически не всегда kebab). Финальная проверка на дубль/наличие
// — на стороне BFF (уникальный constraint), здесь только формат.
const KEY_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const bodySchema = z.object({
  env: aaEnvSchema,
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().refine((v) => KEY_RE.test(v) || v === 'control', 'Ключ варианта: kebab-case, латиница/цифры'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  return proxyToAaAdmin('/aa-admin/experiments/rename-variant', body);
}
