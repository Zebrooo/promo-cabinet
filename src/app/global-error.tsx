"use client";
import { useEffect } from 'react';
import { reportError } from '@/lib/error-reporter';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, kind: 'global-error' });
  }, [error]);
  return (
    <html lang="ru">
      <body style={{ padding: 32 }}>
        <h2>Произошла ошибка</h2>
        <button onClick={reset}>Перезагрузить</button>
      </body>
    </html>
  );
}
