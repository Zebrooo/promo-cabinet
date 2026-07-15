import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/api-auth';
import { syncReferralConfigToBff } from '@/lib/bff-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-side relay: PromoForm (client component) can't hold the Ed25519
 * ticket private key, so it POSTs here after a successful S3 save of a
 * referral-invite custom promo, and this route (Node runtime, has the key)
 * forwards to promo-bff. Best-effort by design — the promo is already
 * persisted in S3 by the time this runs; a BFF outage must not surface as a
 * save failure to the admin (see caller in PromoForm.tsx). Auth mirrors the
 * other /api/promos routes (admin cookie), not the BFF's own service-ticket.
 */
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const active = Boolean(b.active);
  const inviterCreditKopecks = Number(b.inviterCreditKopecks);
  const sellerBonusKopecks = Number(b.sellerBonusKopecks);
  const dailyInviteCap = Number(b.dailyInviteCap);
  const holdHours = Number(b.holdHours);
  if (
    !Number.isInteger(inviterCreditKopecks) || inviterCreditKopecks < 0 ||
    !Number.isInteger(sellerBonusKopecks) || sellerBonusKopecks < 0 ||
    !Number.isInteger(dailyInviteCap) || dailyInviteCap <= 0 ||
    !Number.isInteger(holdHours) || holdHours < 0
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_fields' }, { status: 400 });
  }

  try {
    await syncReferralConfigToBff({ active, inviterCreditKopecks, sellerBonusKopecks, dailyInviteCap, holdHours });
  } catch {
    // Best-effort mirror — BFF/abkhaz-Supabase unavailability must not fail
    // the promo save the admin already completed in S3.
    return NextResponse.json({ ok: false, error: 'bff_unreachable' });
  }
  return NextResponse.json({ ok: true });
}
