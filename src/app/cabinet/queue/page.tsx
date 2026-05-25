import { requireSession } from '@/lib/require-session';
import { readCatalogue } from '@/lib/catalogue';
import { PromoQueue } from '@/components/PromoQueue';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  requireSession();
  let promos;
  try {
    ({ promos } = await readCatalogue());
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Очередь показа</h1></div>
        <p className="error">Не удалось прочитать каталог из S3.</p>
      </main>
    );
  }
  return (
    <main>
      <div className="pagehead">
        <div>
          <p className="kicker">Порядок показа</p>
          <h1>Очередь показа <span className="count-badge">{promos.length}</span></h1>
          <p className="subnote">№1 проверяется первым; пользователю показывается первое подходящее промо.</p>
        </div>
      </div>
      {promos.length === 0
        ? <div className="empty">Очередь пуста. Добавьте промо в разделе «Список».</div>
        : <PromoQueue promos={promos} />}
    </main>
  );
}
