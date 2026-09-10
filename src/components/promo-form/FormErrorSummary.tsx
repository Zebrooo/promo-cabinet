'use client';
// Сводка ошибок в липкой панели: каждая строка — поле с подписью и текстом
// ошибки, клик скроллит к контролу (якорь data-field-error у FieldError).
// Показывается после неудачного сабмита и живёт вместе с Formik-ошибками:
// исправил поле — строка исчезает, исправил все — панель пустеет.
import { useFormikContext } from 'formik';
import { scrollToFieldError } from './fields';
import { summarizeFormErrors, type FormErrorItem } from './form-errors';

export function FormErrorSummary({
  active, extra = [],
}: {
  /** true после сабмита с ошибками (до этого Formik-ошибки не показываем — юзер ещё печатает). */
  active: boolean;
  /** Ошибки вне Formik-стейта (например, из toPersisted → ZodError). */
  extra?: FormErrorItem[];
}) {
  const { errors } = useFormikContext<unknown>();
  if (!active) return null;
  const live = summarizeFormErrors(errors);
  const seen = new Set(live.map((e) => e.path));
  const items = [...live, ...extra.filter((e) => !seen.has(e.path))];
  if (items.length === 0) return null;
  return (
    <div className="editor-bar-error" role="alert">
      <div>Проверьте поля формы — {items.length === 1 ? 'есть ошибка' : `ошибок: ${items.length}`}:</div>
      <ul className="editor-bar-error-list">
        {items.map((e) => (
          <li key={e.path}>
            <button type="button" className="editor-bar-error-link" onClick={() => scrollToFieldError(e.path)}>
              {e.label}
            </button>
            {' — '}{e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
