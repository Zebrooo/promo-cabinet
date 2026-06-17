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
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">ОЧЕРЕДИ</div>
          <h1>Очереди</h1>
        </div>
      </div>

      {queues.length === 0 ? (
        <div className="empty">Очередей пока нет.</div>
      ) : (
        <div className="queue-list" style={{ marginBottom: 28 }}>
          {queues.map((q) => (
            <div className="queue-row" key={q.name}>
              <span className="queue-name">{q.name}</span>
              <span className={`badge ${q.persist ? 'badge-persist' : 'badge-no-persist'}`}>
                {q.persist ? 'persist' : 'не persist'}
              </span>
              <div className="queue-actions">
                <Link
                  href={`/cabinet/queues/${encodeURIComponent(q.name)}`}
                  className="btn btn-secondary btn-sm"
                >
                  Управлять
                </Link>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => togglePersist(q.name, q.persist)}
                  title={q.persist ? 'Снять флаг persist' : 'Включить persist'}
                  data-track="queue_toggle_persist"
                  data-track-name={q.name}
                >
                  {q.persist ? 'Выкл persist' : 'Вкл persist'}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => deleteQueue(q.name)}
                  data-track="queue_delete"
                  data-track-name={q.name}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 2h4a1 1 0 0 0-2 0H6a1 1 0 0 0-2 0H2v1h12V2h-2a1 1 0 0 0-2 0zM3 5l1 8h8l1-8H3z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="form-panel" style={{ maxWidth: 480 }}>
        <div className="panel-head"><h3>Создать очередь</h3></div>
        <div className="panel-body">
          <form onSubmit={createQueue} style={{ display: 'contents' }}>
            <div className="field">
              <label>Имя очереди</label>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="promo-main"
              />
              <div className="hint">Используйте строчные буквы и дефисы</div>
            </div>
            <div className="field">
              <label>Persist (не сбрасывать после показа)</label>
              <select
                className="select"
                value={newPersist ? 'yes' : 'no'}
                onChange={(e) => setNewPersist(e.target.value === 'yes')}
              >
                <option value="no">Нет</option>
                <option value="yes">Да</option>
              </select>
            </div>
            {createError && <p className="error">{createError}</p>}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy}
              style={{ alignSelf: 'flex-start' }}
              data-track="queue_create"
            >
              Создать
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
