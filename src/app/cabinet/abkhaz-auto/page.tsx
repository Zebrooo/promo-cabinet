import { Suspense } from 'react';
import { requireSession } from '@/lib/require-session';
import { AbkhazAutoPanel } from '@/components/AbkhazAutoPanel';

// Данные живут в abkhaz-Supabase за BFF (не в S3-пуле кабинета), поэтому в
// отличие от /cabinet/queues здесь нет серверного pre-fetch — панель сама
// зовёт /api/aa/** при монтировании и при смене env-таба.
export const dynamic = 'force-dynamic';

export default function AbkhazAutoPage() {
  requireSession();
  // useSearchParams() внутри требует Suspense boundary (Next 14 App Router).
  return (
    <Suspense fallback={<div className="empty">Загрузка…</div>}>
      <AbkhazAutoPanel />
    </Suspense>
  );
}
