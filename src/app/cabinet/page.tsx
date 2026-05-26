import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { readPool, readQueuesIndex, readQueue } from '@/lib/catalogue';
import { PromoList } from '@/components/PromoList';

export const dynamic = 'force-dynamic';

export default async function CabinetPage() {
  requireSession();
  try {
    const [promos, queuesIndex] = await Promise.all([readPool(), readQueuesIndex()]);

    // Build membership map: promoId → queue names[]
    const membership: Record<string, string[]> = {};
    const objs = await Promise.all(queuesIndex.map((q) => readQueue(q.name)));
    queuesIndex.forEach((q, i) => {
      for (const id of objs[i].ids) {
        if (!membership[id]) membership[id] = [];
        membership[id].push(q.name);
      }
    });

    const queueNames = queuesIndex.map((q) => q.name);

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
          : <PromoList promos={promos} membership={membership} queueNames={queueNames} />}
      </main>
    );
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Все промо</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }
}
