'use client';
// Кнопка «Включить уведомления»: регистрирует service worker (public/sw.js),
// подписывает браузер на Web Push с публичным VAPID-ключом и отдаёт подписку
// в /api/push/subscription. Сами пуши шлёт promo-bff, когда его поллер
// находит новую рекламную кампанию.
//
// Подписка — на браузер, не на аккаунт: каждый админ включает её на каждом
// своём устройстве отдельно (в кабинете одна общая учётка, привязать к
// человеку нечего).
import { useCallback, useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

type State =
  | { kind: 'checking' }
  | { kind: 'unsupported'; why: string }
  | { kind: 'no-key' }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'on'; endpoint: string }
  | { kind: 'busy'; label: string };

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState({ kind: 'unsupported', why: 'Этот браузер не поддерживает Web Push (на iPhone — добавьте кабинет на экран «Домой»).' });
        return;
      }
      if (!window.isSecureContext) {
        setState({ kind: 'unsupported', why: 'Web Push работает только по HTTPS.' });
        return;
      }
      if (!vapidPublicKey) {
        setState({ kind: 'no-key' });
        return;
      }
      if (Notification.permission === 'denied') {
        setState({ kind: 'denied' });
        return;
      }
      try {
        const reg = await registration();
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setState(sub ? { kind: 'on', endpoint: sub.endpoint } : { kind: 'off' });
      } catch {
        if (!cancelled) setState({ kind: 'off' });
      }
    })();
    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  const enable = useCallback(async () => {
    setError('');
    setState({ kind: 'busy', label: 'Включаю…' });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? { kind: 'denied' } : { kind: 'off' });
        return;
      }
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        }));
      const res = await fetch('/api/push/subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        // Не оставляем «висячую» подписку, о которой сервер не знает.
        await sub.unsubscribe().catch(() => {});
        setError(res.status === 502 ? 'Хранилище недоступно (S3) — попробуйте ещё раз.' : `Не удалось сохранить подписку (ошибка ${res.status}).`);
        setState({ kind: 'off' });
        return;
      }
      trackEvent('push_subscribe_success');
      setState({ kind: 'on', endpoint: sub.endpoint });
    } catch (e) {
      setError(e instanceof Error && e.message ? `Не удалось включить: ${e.message}` : 'Не удалось включить уведомления.');
      setState({ kind: 'off' });
    }
  }, [vapidPublicKey]);

  const disable = useCallback(async () => {
    if (state.kind !== 'on') return;
    setError('');
    const { endpoint } = state;
    setState({ kind: 'busy', label: 'Выключаю…' });
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();
      await fetch('/api/push/subscription', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      trackEvent('push_unsubscribe');
      setState({ kind: 'off' });
    } catch {
      setError('Не удалось выключить уведомления.');
      setState({ kind: 'on', endpoint });
    }
  }, [state]);

  return (
    <div className="push-toggle">
      {state.kind === 'checking' && <span className="push-hint">Проверяю поддержку уведомлений…</span>}
      {state.kind === 'unsupported' && <span className="push-hint">{state.why}</span>}
      {state.kind === 'no-key' && (
        <span className="push-hint">
          Пуши не настроены: задайте <code>WEB_PUSH_VAPID_PUBLIC_KEY</code> у кабинета и пару ключей у BFF.
        </span>
      )}
      {state.kind === 'denied' && (
        <span className="push-hint">Уведомления запрещены в настройках браузера для этого сайта — разрешите их и обновите страницу.</span>
      )}
      {state.kind === 'off' && (
        <button type="button" className="btn btn-primary" onClick={enable} data-track="push_enable">
          Включить уведомления
        </button>
      )}
      {state.kind === 'busy' && (
        <button type="button" className="btn btn-secondary" disabled>{state.label}</button>
      )}
      {state.kind === 'on' && (
        <>
          <span className="badge badge-active">Пуши включены в этом браузере</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={disable} data-track="push_disable">
            Выключить
          </button>
        </>
      )}
      {error && <span className="push-hint push-error">{error}</span>}
    </div>
  );
}
