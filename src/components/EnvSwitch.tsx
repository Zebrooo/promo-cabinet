'use client';
// Компактный свитч «Прод | Тест» в TopStrip + плашка-баннер под шапкой.
// Текущий режим приходит пропом от серверного layout'а (единственный
// источник истины — httpOnly-кука cab_env, читает readEnvMode). После
// успешной смены — location.reload(), чтобы вся страница (серверные фетчи
// + клиентские компоненты вроде AbkhazAutoPanel) пересчиталась в новом
// режиме, без риска половина UI осталась в старом env.
import { useState } from 'react';
import type { EnvMode } from '@/lib/env-mode';

export function EnvSwitch({ env }: { env: EnvMode }) {
  const [busy, setBusy] = useState(false);

  async function switchTo(next: EnvMode) {
    if (next === env || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/env', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ env: next }),
      });
      if (res.ok) {
        location.reload();
        return;
      }
    } catch {
      // ниже общий busy=false — покажем свитч снова кликабельным
    }
    setBusy(false);
  }

  return (
    <div className="env-switch" role="tablist" aria-label="Режим кабинета">
      <button
        type="button" role="tab" aria-selected={env === 'prod'}
        className={`env-switch-tab${env === 'prod' ? ' active' : ''}`}
        disabled={busy} onClick={() => switchTo('prod')}
      >
        Прод
      </button>
      <button
        type="button" role="tab" aria-selected={env === 'test'}
        className={`env-switch-tab${env === 'test' ? ' active' : ''}`}
        disabled={busy} onClick={() => switchTo('test')}
      >
        Тест
      </button>
    </div>
  );
}

/** Заметная плашка режима — на всю ширину, под шапкой, видна на каждой
 *  странице кабинета (рендерится в CabinetShell, не в отдельных страницах). */
export function EnvBanner({ env }: { env: EnvMode }) {
  if (env === 'prod') {
    return (
      <div className="env-banner env-banner-prod" role="status">
        ПРОД — изменения промо и очередей видят живые пользователи
      </div>
    );
  }
  return (
    <div className="env-banner env-banner-test" role="status">
      Тест — изменения видит только тест-витрина
    </div>
  );
}
