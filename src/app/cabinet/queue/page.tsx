import { requireSession } from '@/lib/require-session';
import { readState } from '@/lib/catalogue';
import { PromoQueue } from '@/components/PromoQueue';
import type { Promo } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  requireSession();
  let promos: Promo[] = []; let ordered: Promo[] = [];
  try {
    const state = await readState();
    promos = state.promos;
    // Legacy queue page: no-op until named-queue UI is built — queue will be empty
    void promos;
    ordered = [];
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Очередь показа</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }

  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Порядок показа</p>
          <h1>Очередь показа <span className="count-badge">{ordered.length}</span></h1>
          <p className="subnote">№1 проверяется первым; пользователю показывается первое подходящее промо.</p>
        </div>
      </div>
      {ordered.length === 0
        ? <div className="empty">Очередь пуста — добавьте промо из раздела «Все промо».</div>
        : <PromoQueue promos={ordered} />}
    </main>
  );
}
