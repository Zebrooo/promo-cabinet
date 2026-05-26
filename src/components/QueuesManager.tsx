'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { QueuesIndex } from '@/lib/schema';

export function QueuesManager({ initial }: { initial: QueuesIndex }) {
  const router = useRouter();
  const [queues, setQueues] = useState<QueuesIndex>(initial);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPersist, setNewPersist] = useState(false);
  const [createError, setCreateError] = useState('');

  async function togglePersist(name: string, currentPersist: boolean) {
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persist: !currentPersist }),
      });
      setQueues((cur) => cur.map((q) => q.name === name ? { ...q, persist: !currentPersist } : q));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function deleteQueue(name: string) {
    if (!confirm(`Удалить очередь «${name}»? Промо из неё не удалятся, только ссылки из очереди.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/queues/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setQueues((cur) => cur.filter((q) => q.name !== name));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createQueue(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    const name = newName.trim();
    if (!name) { setCreateError('Укажите имя очереди.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/queues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, persist: newPersist }),
      });
      if (res.ok) {
        setNewName('');
        setNewPersist(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === 'duplicate_queue') {
          setCreateError('Очередь с таким именем уже есть.');
        } else {
          setCreateError(`Ошибка ${res.status}.`);
        }
      }
    } catch {
      setCreateError('Сеть недоступна — проверьте соединение.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {queues.length === 0 ? (
        <div className="empty">Очередей пока нет.</div>
      ) : (
        <ol className="queue">
          {queues.map((q) => (
            <li className="qrow" key={q.name}>
              <div className="qrow__main">
                <span className="qrow__title">{q.name}</span>
              </div>
              <span className={`pill ${q.persist ? 'pill--on' : 'pill--off'}`}>
                {q.persist ? 'persist' : 'не persist'}
              </span>
              <Link href={`/cabinet/queues/${encodeURIComponent(q.name)}`} className="btn">
                Управлять
              </Link>
              <button
                disabled={busy}
                onClick={() => togglePersist(q.name, q.persist)}
                title={q.persist ? 'Снять флаг persist' : 'Включить persist'}
              >
                {q.persist ? 'Выкл persist' : 'Вкл persist'}
              </button>
              <button
                className="btn--danger"
                disabled={busy}
                onClick={() => deleteQueue(q.name)}
              >
                Удалить
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="form-card" style={{ maxWidth: '520px' }}>
        <h2 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Создать очередь</h2>
        <form onSubmit={createQueue}>
          <div className="form-grid">
            <div className="field field--full">
              <label>Имя очереди</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="promo-main"
              />
            </div>
            <div className="field">
              <label>Persist (не сбрасывать после показа)</label>
              <select value={newPersist ? 'yes' : 'no'} onChange={(e) => setNewPersist(e.target.value === 'yes')}>
                <option value="no">Нет</option>
                <option value="yes">Да</option>
              </select>
            </div>
          </div>
          {createError && <p className="error">{createError}</p>}
          <div className="form-actions">
            <button type="submit" className="primary" disabled={busy}>Создать</button>
          </div>
        </form>
      </div>
    </div>
  );
}
