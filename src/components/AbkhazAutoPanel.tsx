'use client';
// Пульт канарейки релиза + эксперименты витрины abkhaz-auto. Данные живут в
// abkhaz-Supabase за promo-bff (/aa-admin/**), поэтому в отличие от прочих
// страниц кабинета (S3-пул) здесь нет серверного pre-fetch — всё грузится
// client-side при монтировании и при смене env-таба.
//
// Перенесено из витрины (src/app/admin/experiments/{CanaryPanel,ExperimentsAdmin}.tsx),
// упрощено под стиль кабинета:
//  - никакого forceVariant/аудита/датalist-подсказок реестра кода — кабинет не
//    видит src/lib/flags/registry.ts витрины, сверять варианты кода/БД тут нечем;
//  - "залипнуть в вариант" (кука браузера ВИТРИНЫ) не переносится — это
//    QA-приём для конкретного браузера, в кабинете бессмысленен; вместо
//    кнопки — текстовая подсказка, как включить это на самой витрине;
//  - нет useTransition/server actions (кабинет не на server actions) — обычный
//    fetch + локальный busy-стейт, как в QueueEditor/QueuesManager.
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Env = 'test' | 'prod';

interface CanaryState {
  colour: 'blue' | 'green' | null;
  pct: number;
  updated_at: string | null;
  updated_by: string | null;
}

interface ExperimentVariant {
  key: string;
  weight: number;
  is_control: boolean;
}

interface ExperimentRow {
  key: string;
  title: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  kill_switch: boolean;
  rollout_pct: number;
  salt: number;
  surface: 'client' | 'dynamic';
  authOnly: boolean;
  variants: ExperimentVariant[];
}

const QUICK_PCT = [5, 10, 25, 50, 99];
const STATUS_LABEL: Record<ExperimentRow['status'], string> = {
  draft: 'черновик', running: 'идёт', paused: 'пауза', completed: 'завершён',
};

/** Человеко-читаемые тексты для кодов ошибок, которые штатно шлёт BFF —
 *  остальное (network/невалидный JSON) показываем общим текстом. */
function describeError(status: number, error?: string): string {
  // Без слова «тестовое»: 503 env_not_configured может прилететь для ЛЮБОГО
  // окружения, и ложное «тестовое» на табе «Прод» дезориентирует (ревью).
  if (status === 503 && error === 'env_not_configured') return 'Это окружение не настроено в BFF (нет AA_*_SUPABASE_URL/KEY).';
  if (status === 409 && error === 'canary_not_active') return 'Канарейка не включена — процент менять нечему.';
  if (error) return error;
  return `Ошибка ${status}`;
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: 'Сеть недоступна — проверьте соединение.' };
  }
  const data = await res.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
  if (!res.ok) return { ok: false, message: describeError(res.status, data.error) };
  return { ok: true, data: data as T };
}

function EnvTabs({ env }: { env: Env }) {
  const router = useRouter();
  const setEnv = (next: Env) => router.push(`/cabinet/abkhaz-auto?env=${next}`);
  return (
    <div className="env-tabs" role="tablist" aria-label="Окружение">
      <button type="button" role="tab" aria-selected={env === 'prod'} className={`env-tab${env === 'prod' ? ' active' : ''}`} onClick={() => setEnv('prod')}>
        Прод
      </button>
      <button type="button" role="tab" aria-selected={env === 'test'} className={`env-tab${env === 'test' ? ' active' : ''}`} onClick={() => setEnv('test')}>
        Тест
      </button>
    </div>
  );
}

function CanarySection({ env }: { env: Env }) {
  const [state, setState] = useState<CanaryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await postJson<CanaryState>('/api/aa/canary/state', { env });
    if (r.ok) {
      setState(r.data);
      setPct(String(r.data.pct));
    } else {
      setState(null);
      setError(r.message);
    }
    setLoading(false);
  }, [env]);

  useEffect(() => { void load(); }, [load]);

  async function apply(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 99) {
      setError('Процент: целое число 0..99.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await postJson('/api/aa/canary/pct', { env, pct: value });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await load();
  }

  return (
    <section className="aa-section">
      <div className="aa-section-title">Канарейка релиза</div>
      <div className="form-panel">
        <div className="panel-body">
          {loading ? (
            <div className="empty">Загрузка…</div>
          ) : state == null ? (
            <div className="aa-hint">{error ?? 'Не удалось получить состояние канарейки.'}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {state.colour != null ? (
                  <span className="badge badge-active">web-{state.colour} ~{state.pct}%</span>
                ) : (
                  <span className="badge badge-inactive">не активна</span>
                )}
                {state.colour != null && state.updated_at && (
                  <span style={{ fontSize: 12, color: 'var(--app-fg3)' }}>
                    обновлено {new Date(state.updated_at).toLocaleString('ru-RU')}
                    {state.updated_by ? ` · ${state.updated_by}` : ''}
                  </span>
                )}
              </div>

              {state.colour == null ? (
                <div className="aa-hint">
                  Включается на сервере: <code>bash scripts/bluegreen.sh canary-deploy &lt;pct&gt;</code> — новый цвет получит
                  процент трафика без промоута.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {QUICK_PCT.map((q) => (
                    <button key={q} type="button" className="btn btn-secondary btn-sm" disabled={busy || state.pct === q} onClick={() => apply(q)}>
                      {q}%
                    </button>
                  ))}
                  <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12 }}>Свой %</span>
                    <input
                      className="aa-inline-input" type="number" min={0} max={99} step={1}
                      value={pct} disabled={busy}
                      onChange={(e) => setPct(e.target.value)}
                    />
                  </label>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy || pct.trim() === ''} onClick={() => apply(Number(pct))}>
                    Применить
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy || state.pct === 0} onClick={() => apply(0)} title="Куки больше не раздаются; уже включённые вернутся на активный цвет при следующем заходе.">
                    Стоп (0%)
                  </button>
                </div>
              )}
            </>
          )}
          {error && state != null && <div className="error">{error}</div>}
        </div>
      </div>
    </section>
  );
}

interface CreateExperimentForm {
  key: string;
  title: string;
  surface: 'client' | 'dynamic';
  variantsCsv: string;
}

const EMPTY_CREATE_FORM: CreateExperimentForm = { key: '', title: '', surface: 'client', variantsCsv: 'control, on' };

function ExperimentRowView({ row, env, onChanged }: { row: ExperimentRow; env: Env; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollout, setRollout] = useState(String(row.rollout_pct));
  const [weights, setWeights] = useState<Record<string, string>>(
    Object.fromEntries(row.variants.map((v) => [v.key, String(v.weight)])),
  );
  const [renameFrom, setRenameFrom] = useState(row.variants[0]?.key ?? '');
  const [renameTo, setRenameTo] = useState('');

  const totalWeight = row.variants.reduce((s, v) => s + v.weight, 0);

  async function run(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const r = await postJson(path, { env, id: row.key, ...body });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    onChanged();
  }

  const statusBadgeClass = row.kill_switch ? 'badge-exp-killed' : `badge-exp-${row.status}`;

  return (
    <div className="form-panel" style={{ marginBottom: 12 }}>
      <div className="panel-head" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{row.title}</h3>
        <span className="aa-key">{row.key}</span>
        <span className={`badge ${statusBadgeClass}`}>{row.kill_switch ? '⛔ kill-switch' : STATUS_LABEL[row.status]}</span>
        <span style={{ fontSize: 11.5, color: 'var(--app-fg3)' }}>{row.surface} · salt {row.salt}</span>
      </div>
      <div className="panel-body">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 140 }}>
            <label>Статус</label>
            <select className="select" value={row.status} disabled={busy} onChange={(e) => run('/api/aa/experiments/patch', { patch: { status: e.target.value } })}>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field" style={{ width: 100 }}>
            <label>Раскатка %</label>
            <input className="input" type="number" min={0} max={100} step={1} value={rollout} disabled={busy} onChange={(e) => setRollout(e.target.value)} />
          </label>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run('/api/aa/experiments/patch', { patch: { rollout_pct: Number(rollout) } })}>
            Сохранить %
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked={row.authOnly} disabled={busy} onChange={(e) => run('/api/aa/experiments/patch', { patch: { authOnly: e.target.checked } })} />
            только авторизованным
          </label>
          <button
            type="button"
            className={`btn btn-sm ${row.kill_switch ? 'btn-secondary' : 'btn-danger'}`}
            disabled={busy}
            onClick={() => run('/api/aa/experiments/patch', { patch: { kill_switch: !row.kill_switch } })}
          >
            {row.kill_switch ? 'Снять kill-switch' : '⛔ Kill-switch'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run('/api/aa/experiments/bump-salt', {})} title="Перераскидать всех зрителей заново">
            Перебакетировать (salt+1)
          </button>
        </div>

        <div className="aa-table-wrap">
          <table className="aa-table">
            <thead>
              <tr><th>Вариант</th><th>Доля</th><th>Вес</th></tr>
            </thead>
            <tbody>
              {row.variants.map((v) => (
                <tr key={v.key}>
                  <td>
                    <span className="aa-key">{v.key}</span>
                    {v.is_control && <span className="badge badge-tag" style={{ marginLeft: 8 }}>control</span>}
                  </td>
                  <td>{totalWeight > 0 ? `${Math.round((v.weight / totalWeight) * 100)}%` : '—'}</td>
                  <td>
                    <input
                      className="aa-inline-input" type="number" min={0} step={1} disabled={busy}
                      aria-label={`Вес варианта ${v.key}`}
                      value={weights[v.key] ?? '0'}
                      onChange={(e) => setWeights((w) => ({ ...w, [v.key]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button
            type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => run('/api/aa/experiments/variant-weights', {
              weights: row.variants.map((v) => ({ key: v.key, weight: Number(weights[v.key] ?? 0) })),
            })}
          >
            Сохранить веса
          </button>
        </div>

        {row.variants.length > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ width: 140 }}>
              <label>Переименовать</label>
              <select className="select" value={renameFrom} disabled={busy} onChange={(e) => setRenameFrom(e.target.value)}>
                {row.variants.map((v) => <option key={v.key} value={v.key}>{v.key}</option>)}
              </select>
            </label>
            <label className="field" style={{ width: 140 }}>
              <label>В</label>
              <input className="input" value={renameTo} disabled={busy} placeholder="new-key" onChange={(e) => setRenameTo(e.target.value)} />
            </label>
            <button
              type="button" className="btn btn-secondary btn-sm" disabled={busy || !renameTo.trim()}
              onClick={() => run('/api/aa/experiments/rename-variant', { from: renameFrom, to: renameTo.trim() })}
            >
              Переименовать
            </button>
          </div>
        )}

        <div className="aa-hint">
          «Залипнуть» в конкретный вариант для проверки — только на самой витрине: кнопка «включить себе» в{' '}
          <code>/admin/experiments</code> (работает лишь для surface=client, кука браузера витрины).
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}

function CreateExperimentSection({ env, onCreated }: { env: Env; onCreated: () => void }) {
  const [form, setForm] = useState<CreateExperimentForm>(EMPTY_CREATE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setError(null);
    setOk(false);
    const key = form.key.trim();
    const title = form.title.trim();
    if (!key || !title) { setError('Нужны ключ и заголовок.'); return; }
    const names = form.variantsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length < 2) { setError('Минимум 2 варианта.'); return; }
    const variants = names.map((k, i) => ({ key: k, weight: 1, is_control: i === 0, position: i }));

    setBusy(true);
    const r = await postJson('/api/aa/experiments/create', { env, key, title, surface: form.surface, variants });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setOk(true);
    setForm(EMPTY_CREATE_FORM);
    onCreated();
  }

  return (
    <div className="form-panel" style={{ marginBottom: 16 }}>
      <div className="panel-head"><h3>Новый эксперимент</h3></div>
      <div className="panel-body">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 180 }}>
            <label>Ключ (kebab)</label>
            <input className="input mono-input" value={form.key} disabled={busy} placeholder="new-card-layout" onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
          </label>
          <label className="field" style={{ width: 220 }}>
            <label>Заголовок</label>
            <input className="input" value={form.title} disabled={busy} placeholder="Новый лейаут карточки" onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="field" style={{ width: 120 }}>
            <label>Surface</label>
            <select className="select" value={form.surface} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, surface: e.target.value as 'client' | 'dynamic' }))}>
              <option value="client">client</option>
              <option value="dynamic">dynamic</option>
            </select>
          </label>
          <label className="field" style={{ width: 200 }}>
            <label>Варианты (1-й = control)</label>
            <input className="input" value={form.variantsCsv} disabled={busy} onChange={(e) => setForm((f) => ({ ...f, variantsCsv: e.target.value }))} />
          </label>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>Создать</button>
        </div>
        <div className="aa-hint">
          Создаётся черновиком с раскаткой 0%. Ключ и варианты должны совпадать с реестром кода витрины
          (<code>src/lib/flags/registry.ts</code>) — иначе код эксперимент не увидит.
        </div>
        {error && <div className="error">{error}</div>}
        {ok && <div style={{ fontSize: 12.5, color: 'var(--status-success)' }}>✓ Создан</div>}
      </div>
    </div>
  );
}

function ExperimentsSection({ env }: { env: Env }) {
  const [rows, setRows] = useState<ExperimentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await postJson<{ experiments: ExperimentRow[] }>('/api/aa/experiments/list', { env });
    if (r.ok) {
      setRows(r.data.experiments ?? []);
    } else {
      setRows(null);
      setError(r.message);
    }
    setLoading(false);
  }, [env]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="aa-section">
      <div className="aa-section-title">Эксперименты</div>
      <p style={{ fontSize: 12.5, color: 'var(--app-fg3)', maxWidth: 720 }}>
        Код витрины проверяет вариант зрителя через <code>useExperiment(&quot;ключ&quot;)</code>. «Раскатка %» — доля
        зрителей, которая вообще попадает в эксперимент (остальные — control). Kill-switch мгновенно выключает всех;
        salt+1 перераскидывает зрителей заново.
      </p>
      <CreateExperimentSection env={env} onCreated={load} />
      {loading ? (
        <div className="empty">Загрузка…</div>
      ) : rows == null ? (
        <div className="aa-hint">{error ?? 'Не удалось загрузить эксперименты.'}</div>
      ) : rows.length === 0 ? (
        <div className="empty">Пока нет экспериментов.</div>
      ) : (
        rows.map((row) => <ExperimentRowView key={row.key} row={row} env={env} onChanged={load} />)
      )}
    </section>
  );
}

export function AbkhazAutoPanel() {
  const searchParams = useSearchParams();
  const envParam = searchParams.get('env');
  const env: Env = envParam === 'test' ? 'test' : 'prod'; // прод по умолчанию — любое иное значение тоже трактуем как прод

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header">
        <div className="left">
          <div className="eyebrow">ABKHAZ AUTO</div>
          <h1>Пульт релиза и экспериментов</h1>
        </div>
      </div>

      <EnvTabs env={env} />

      {/* key=env — при смене таба секции монтируются заново и грузят данные
          нужного окружения с нуля, без риска смешать стейт test/prod. */}
      <CanarySection key={`canary-${env}`} env={env} />
      <ExperimentsSection key={`exp-${env}`} env={env} />
    </div>
  );
}
