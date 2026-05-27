import { requireSession } from '@/lib/require-session';
import { ensureMainQueue, readQueuesIndex } from '@/lib/catalogue';
import { QueuesManager } from '@/components/QueuesManager';

export const dynamic = 'force-dynamic';

export default async function QueuesPage() {
  requireSession();
  try {
    await ensureMainQueue();
    const queues = await readQueuesIndex();
    return <QueuesManager initial={queues} />;
  } catch {
    return <p className="empty">Не удалось прочитать данные из S3.</p>;
  }
}
