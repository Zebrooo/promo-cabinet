import { cookies } from 'next/headers';
import { PushCampaignsPanel } from '@/components/PushCampaignsPanel';
import { readEnvMode } from '@/lib/env-mode';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

export default function PushCampaignsPage() {
  requireSession();
  return <PushCampaignsPanel env={readEnvMode(cookies())} />;
}
