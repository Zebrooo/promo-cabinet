import { cookies } from 'next/headers';
import { requireSession } from '@/lib/require-session';
import { readEnvMode } from '@/lib/env-mode';
import { AbkhazAutoPanel } from '@/components/AbkhazAutoPanel';

// Данные живут в abkhaz-Supabase за BFF (не в S3-пуле кабинета), поэтому в
// отличие от /cabinet/queues здесь нет серверного pre-fetch — панель сама
// зовёт /api/aa/** при монтировании. Режим (прод/тест) больше не свой
// собственный ?env=-таб — приходит от глобального переключателя кабинета.
export const dynamic = 'force-dynamic';

export default function AbkhazAutoPage() {
  requireSession();
  const env = readEnvMode(cookies());
  return <AbkhazAutoPanel env={env} />;
}
