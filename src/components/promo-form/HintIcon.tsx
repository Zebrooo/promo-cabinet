'use client';
// Иконка (i) с подсказкой по клику — замена поясняющих .ef-hint в потоке
// формы (фидбек владельца: текст загромождал форму). Popover закрывается
// повторным кликом или кликом вне; доступность — button с aria-expanded /
// aria-controls. Стили — .hint-wrap/.hint-icon/.hint-popover в editor-styles.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function HintIcon({ text, label = 'Подсказка' }: { text: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  return (
    <span className="hint-wrap" ref={rootRef}>
      <button
        type="button"
        className="hint-icon"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className="hint-popover" id={popId} role="note">
          {text}
        </span>
      )}
    </span>
  );
}
