import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { env } from '@/env';
import { isAuthed } from '@/lib/api-auth';
import { decideCampaign } from '@/lib/bff-client';

export const runtime = 'nodejs';

const bodySchema = z.object({
  campaignId: z.number().int().positive(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

/** Решение админа по кампании → promo-bff. Актор — общий админ-логин
 *  кабинета (в кабинете одна учётка), чтобы в истории было видно, что решение
 *  принято здесь, а не bootstrap'ом поллера. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const { status, body: respBody } = await decideCampaign({
      campaignId: body.campaignId,
      decision: body.decision,
      ...(body.reason ? { reason: body.reason } : {}),
      actor: env.adminUser || 'admin',
    });
    return NextResponse.json(respBody, { status });
  } catch {
    return NextResponse.json({ error: 'bff_unreachable' }, { status: 502 });
  }
}
