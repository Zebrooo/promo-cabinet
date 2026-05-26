import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { readState } from '@/lib/catalogue';
import { PromoList } from '@/components/PromoList';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  let promos; let queuedIds: string[] = [];
  try {
    const state = await readState();
    promos = state.promos;
    // Legacy compatibility: show no queued badge until named-queue UI is built
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Все промо</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }
  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Каталог</p>
          <h1>Все промо <span className="count-badge">{promos.length}</span></h1>
        </div>
        <Link className="btn btn--primary" href="/cabinet/new">+ Новое промо</Link>
      </div>
      {promos.length === 0
        ? <div className="empty">Промо пока нет. Создайте первое — оно появится здесь; добавьте его в очередь, чтобы показывать.</div>
        : <PromoList promos={promos} queuedIds={queuedIds} />}
    </main>
  );
}
