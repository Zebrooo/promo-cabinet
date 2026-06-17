"use client";
import { useEffect } from 'react';
import { reportError } from '@/lib/error-reporter';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, kind: 'error-boundary' });
  }, [error]);
  return (
    <div style={{ padding: 32 }}>
      <h2>Что-то пошло не так</h2>
      <button onClick={reset}>Попробовать снова</button>
    </div>
  );
}
