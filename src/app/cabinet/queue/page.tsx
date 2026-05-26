import { requireSession } from '@/lib/require-session';
import { readState } from '@/lib/catalogue';
import { PromoQueue } from '@/components/PromoQueue';
import type { Promo } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  requireSession();
  let promos; let queue;
  try {
    ({ promos, queue } = await readState());
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Очередь показа</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }
  // Resolve queue ids to promos, in order, skipping dangling ids.
  const byId = new Map(promos.map((p) => [p.id, p]));
  const ordered = queue.map((id) => byId.get(id)).filter((p): p is Promo => p !== undefined);

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
