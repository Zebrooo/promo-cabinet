"use client";
import { useEffect } from 'react';
import { reportError } from '@/lib/error-reporter';

export function ErrorListeners() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, { kind: 'window.onerror' });
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, { kind: 'unhandledrejection' });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
