import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { ensureMainQueue, readQueuesIndex } from '@/lib/catalogue';
import { QueuesManager } from '@/components/QueuesManager';

export const dynamic = 'force-dynamic';

export default async function QueuesPage() {
  requireSession();
  try {
    await ensureMainQueue();
    const queues = await readQueuesIndex();
    return (
      <main>
        <div className="pagehead">
          <div>
            <p className="kicker">Управление</p>
            <h1>Очереди <span className="count-badge">{queues.length}</span></h1>
          </div>
          <Link className="btn btn--primary" href="/cabinet">← Все промо</Link>
        </div>
        <QueuesManager initial={queues} />
      </main>
    );
  } catch {
    return (
      <main>
        <div className="pagehead"><h1>Очереди</h1></div>
        <p className="error">Не удалось прочитать данные из S3.</p>
      </main>
    );
  }
}
