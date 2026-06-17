'use client';
// Drop-zone + file-picker для загрузки картинок промо. Заменяет URL-input.
// Юзер может либо drag-and-drop, либо click → file dialog, либо вставить
// URL руками через «Указать URL вручную ▾».
//
// После успешного POST /api/upload — вызываем onChange(url). Сохраняется
// в imageUrl / backgroundImage в Promo. Превью показывается inline; кнопка
// «Заменить» сбрасывает state и открывает picker снова.

import { useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type Props = {
  value: string;
  onChange: (url: string) => void;
  /** Подпись на пустом dropzone — «Картинка карточки» / «Фон попапа» и т.д. */
  label?: string;
  /** Подсказка про рекомендованный размер — печатается мелким серым. */
  recommend?: string;
  /** Передаётся в /api/generate-image для подбора нужных dimensions
   *  (popup/inline/topline/fullscreen). */
  format?: string;
};

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

const ERROR_LABELS: Record<string, string> = {
  too_large: 'Файл больше 5 MB. Сожми и попробуй снова.',
  unsupported_type: 'Поддерживаются только JPEG / PNG / WebP / GIF / AVIF.',
  no_file: 'Файл не выбран.',
  s3_unavailable: 'Хранилище временно недоступно — попробуй ещё раз.',
  unauthorized: 'Сессия истекла. Войди снова.',
  invalid_body: 'Не удалось прочитать файл.',
  prompt_too_short: 'Слишком короткое описание — добавь хотя бы пару деталей.',
  rate_limited: 'Слишком частые запросы. Попробуй через минуту.',
  image_unavailable: 'AI-сервис временно недоступен — попробуй ещё раз.',
  malformed_response: 'AI вернул некорректный ответ — попробуй ещё раз.',
  ai_disabled: 'AI-помощник не настроен.',
  ai_timeout: 'AI не успел сгенерировать картинку. Попробуй ещё раз.',
  ai_unauthorized: 'Не удалось авторизоваться в AI-сервисе.',
  ai_unavailable: 'AI-сервис недоступен.',
};

export function PromoImageUpload({ value, onChange, label, recommend, format }: Props) {
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [drag, setDrag]   = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function generateWithAi() {
    if (aiPrompt.trim().length < 4) {
      setError('Опиши что нарисовать (минимум несколько слов).');
      return;
    }
    setError(''); setAiBusy(true);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim(), format }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        trackEvent('promo_image_upload_failed', { kind: 'generate' });
        setError(ERROR_LABELS[json.error ?? ''] ?? `Не удалось сгенерировать (${res.status}).`);
        return;
      }
      trackEvent('promo_image_upload_success', { kind: 'generate' });
      onChange(json.url);
      setAiOpen(false); setAiPrompt('');
    } finally {
      setAiBusy(false);
    }
  }

  async function upload(file: File) {
    setError('');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; detail?: string };
      if (!res.ok || !json.url) {
        trackEvent('promo_image_upload_failed', { kind: 'upload' });
        setError(ERROR_LABELS[json.error ?? ''] ?? `Не удалось загрузить (${res.status}).`);
        return;
      }
      trackEvent('promo_image_upload_success', { kind: 'upload' });
      onChange(json.url);
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    e.target.value = ''; // позволяем выбрать тот же файл повторно
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  if (value) {
    return (
      <div className="piu piu-filled">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="piu-thumb" />
        <div className="piu-meta">
          <div className="piu-meta-name mono">{shortUrl(value)}</div>
          <button
            type="button"
            className="piu-replace"
            onClick={() => onChange('')}
            disabled={busy}
          >Заменить</button>
        </div>
        <PiuCss />
      </div>
    );
  }

  return (
    <div className="piu">
      <button
        type="button"
        className={`piu-dropzone${drag ? ' is-drag' : ''}${busy ? ' is-busy' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        disabled={busy}
        aria-label={label ?? 'Загрузить картинку'}
      >
        <div className="piu-icon" aria-hidden>↑</div>
        <div className="piu-prompt">
          {busy ? 'Загружаем…' : 'Перетащи картинку или нажми чтобы выбрать'}
        </div>
        <div className="piu-sub">
          JPEG / PNG / WebP, до 5 MB{recommend ? ` · рекомендуем ${recommend}` : ''}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </button>

      <div className="piu-secondary-row">
        <button
          type="button"
          className="piu-ai-btn"
          onClick={() => setAiOpen((v) => !v)}
          disabled={busy}
        >✨ Сгенерировать с AI</button>
        <button
          type="button"
          className="piu-url-toggle"
          onClick={() => setShowUrl((v) => !v)}
        >{showUrl ? 'Скрыть URL ▴' : 'Указать URL вручную ▾'}</button>
      </div>

      {aiOpen && (
        <div className="piu-ai-panel">
          <div className="piu-ai-label">Опиши промо одним абзацем</div>
          <textarea
            className="piu-ai-prompt"
            placeholder="Например: летний попап для гостиницы в Гагре, тёплые цвета моря и пальмы, абхазский колорит, минимум деталей, плоский постер-стиль"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={aiBusy}
          />
          <div className="piu-ai-foot">
            <span className="piu-ai-hint">Текст и кнопку добавит сам редактор. AI рисует только фон/визуал.</span>
            <button
              type="button"
              className="piu-ai-go"
              onClick={generateWithAi}
              disabled={aiBusy || aiPrompt.trim().length < 4}
            >{aiBusy ? 'Рисую (20-40сек)…' : 'Сгенерировать'}</button>
          </div>
        </div>
      )}

      {showUrl && (
        <input
          className="piu-url-input mono"
          placeholder="https://… (URL картинки)"
          onChange={(e) => onChange(e.target.value.trim() || '')}
        />
      )}

      {error && <div className="piu-error">{error}</div>}
      <PiuCss />
    </div>
  );
}

function shortUrl(u: string): string {
  return u.length > 56 ? u.slice(0, 28) + '…' + u.slice(-26) : u;
}

function PiuCss() {
  return (
    <style>{`
      .piu { display: flex; flex-direction: column; gap: 8px; }
      .piu .mono { font-family: var(--font-mono); }
      .piu-dropzone {
        background: var(--app-surface2);
        border: 2px dashed var(--app-border2);
        border-radius: 12px;
        padding: 28px 20px;
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        cursor: pointer; text-align: center;
        font-family: inherit;
        transition: border-color var(--dur-fast), background var(--dur-fast);
      }
      .piu-dropzone:hover:not(:disabled) {
        border-color: var(--brand-sea-700);
        background: #fff;
      }
      .piu-dropzone.is-drag {
        border-color: var(--brand-sea-700);
        background: #FDEFF0;
      }
      .piu-dropzone.is-busy { opacity: 0.7; cursor: wait; }
      .piu-icon {
        width: 40px; height: 40px; border-radius: 12px;
        background: var(--brand-sea-100); color: var(--brand-sea-700);
        font-size: 20px; font-weight: 800;
        display: flex; align-items: center; justify-content: center;
      }
      .piu-prompt { font-size: 14px; font-weight: 600; color: var(--app-fg1); margin-top: 8px; }
      .piu-sub { font-size: 12px; color: var(--app-fg3); }

      .piu-secondary-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .piu-ai-btn {
        background: linear-gradient(180deg, #16181D 0%, #3A3F48 100%);
        color: #fff;
        border: 0; border-radius: 999px;
        height: 32px; padding: 0 14px;
        font-family: inherit; font-size: 12px; font-weight: 600;
        cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px;
        box-shadow: 0 0 0 1px rgba(225,29,42,0.2);
        transition: box-shadow var(--dur-fast);
      }
      .piu-ai-btn:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(225,29,42,0.25); }
      .piu-ai-btn:disabled { opacity: 0.5; cursor: wait; }

      .piu-url-toggle {
        background: none; border: 0;
        font-family: inherit;
        font-size: 12px; font-weight: 600; color: var(--app-fg3);
        cursor: pointer;
        padding: 4px 0;
      }
      .piu-url-toggle:hover { color: var(--brand-sea-700); }

      .piu-ai-panel {
        background: #fff;
        border: 1px solid var(--brand-coral-300);
        border-radius: 14px;
        padding: 14px 16px;
        display: flex; flex-direction: column; gap: 10px;
      }
      .piu-ai-label {
        font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
        text-transform: uppercase; color: var(--app-fg3);
      }
      .piu-ai-prompt {
        width: 100%; resize: vertical;
        background: var(--app-surface2);
        border: 1px solid var(--app-border);
        border-radius: 10px;
        padding: 10px 14px;
        font-family: inherit; font-size: 13px; line-height: 1.45;
        color: var(--app-fg1);
        min-height: 72px;
      }
      .piu-ai-prompt:focus { outline: 0; border-color: var(--brand-sea-600); box-shadow: 0 0 0 3px var(--input-focus-ring); }
      .piu-ai-foot {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        flex-wrap: wrap;
      }
      .piu-ai-hint { font-size: 11px; color: var(--app-fg4); flex: 1; min-width: 200px; }
      .piu-ai-go {
        background: var(--brand-coral-600); color: #fff;
        border: 0; border-radius: 10px;
        height: 36px; padding: 0 18px;
        font-family: inherit; font-size: 13px; font-weight: 600;
        cursor: pointer;
        transition: background var(--dur-fast);
      }
      .piu-ai-go:hover:not(:disabled) { background: var(--brand-coral-700); }
      .piu-ai-go:disabled { opacity: 0.5; cursor: not-allowed; }
      .piu-url-input {
        width: 100%; background: #fff;
        border: 1px solid var(--app-border); border-radius: 10px;
        height: 40px; padding: 0 14px;
        font-size: 12px;
      }
      .piu-error {
        background: var(--status-danger-bg); color: var(--status-danger);
        border-radius: 8px; padding: 8px 12px;
        font-size: 12px; font-weight: 600;
      }

      .piu-filled {
        flex-direction: row; align-items: center; gap: 16px;
        background: var(--app-surface2);
        border: 1px solid var(--app-border);
        border-radius: 12px;
        padding: 14px;
      }
      .piu-thumb {
        width: 80px; height: 80px;
        object-fit: cover; border-radius: 8px;
        background: var(--app-border);
        flex-shrink: 0;
      }
      .piu-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .piu-meta-name {
        font-size: 12px; color: var(--app-fg2);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .piu-replace {
        align-self: flex-start;
        background: none; border: 0;
        font-family: inherit;
        font-size: 13px; font-weight: 600; color: var(--brand-coral-600);
        cursor: pointer; padding: 0;
      }
      .piu-replace:hover { color: var(--brand-coral-700); }
    `}</style>
  );
}
