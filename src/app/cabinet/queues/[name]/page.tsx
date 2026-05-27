import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { readPool, readQueue, readQueuesIndex } from '@/lib/catalogue';
import { QueueEditor } from '@/components/QueueEditor';
import type { Promo } from '@/lib/schema';

export const dynamic = 'force-dynamic';

interface Props {
  params: { name: string };
}

export default async function QueueNamePage({ params }: Props) {
  requireSession();
  const queueName = decodeURIComponent(params.name);

  try {
    const [poolPromos, queuesIndex, queueObj] = await Promise.all([
      readPool(),
      readQueuesIndex(),
      readQueue(queueName),
    ]);

    // Verify the queue exists in the index
    const exists = queuesIndex.some((q) => q.name === queueName);
    if (!exists) notFound();

    const poolById = new Map<string, Promo>(poolPromos.map((p) => [p.id, p]));
    const queuePromos: Promo[] = queueObj.ids.flatMap((id) => {
      const p = poolById.get(id);
      return p ? [p] : [];
    });

    return (
      <QueueEditor
        name={queueName}
        persist={queueObj.persist}
        promos={queuePromos}
        poolPromos={poolPromos}
      />
    );
  } catch (err) {
    // notFound() throws, let it propagate
    if ((err as { digest?: string }).digest === 'NEXT_NOT_FOUND') throw err;
    return <p className="empty">Не удалось прочитать данные из S3.</p>;
  }
}
