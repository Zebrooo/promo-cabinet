'use client';
// Formik field primitives — thin useField() wrappers over the existing
// ef-* markup/classes from the pre-refactor monolith. Visual is unchanged;
// only the state wiring moved from useState/set() to Formik.
import { useField } from 'formik';

type BaseProps = {
  name: string;
  label?: string;
  placeholder?: string;
  className?: string;
  maxLength?: number;
};

/** Shows the field's error under it, but only once the user has touched the
 *  field (or the form was submitted) — mirrors the ТЗ's "touched" rule. */
function FieldError({ name }: { name: string }) {
  const [, meta] = useField(name);
  // Для пути-блока (lifecycle, targeting.advertiser) Formik отдаёт в error
  // дерево ошибок вложенных полей — его рисуют FieldError-ы самих полей;
  // здесь показываем только строку (ошибку самого блока), иначе React
  // упадёт на объекте-ребёнке.
  if (!meta.touched || typeof meta.error !== 'string' || !meta.error) return null;
  // data-field-error — якорь для сводки ошибок в липкой панели: по клику
  // на строку сводки страница скроллит к этому элементу (scrollToFieldError).
  return <div className="hint hint-warn ef-field-error" data-field-error={name}>{meta.error}</div>;
}

/** Элемент ошибки поля по Formik-пути; без пути — первая ошибка на странице. */
export function findFieldErrorElement(path?: string): Element | null {
  if (typeof document === 'undefined') return null;
  if (path) {
    const exact = document.querySelector(`[data-field-error="${CSS.escape(path)}"]`);
    if (exact) return exact;
  }
  return document.querySelector('.ef-field-error');
}

/** Кнопка «Сохранить» живёт в липкой панели, а поле с ошибкой может быть на
 *  два экрана ниже: после сабмита с ошибками прокручиваем к первой из них
 *  (или к конкретной — по клику в сводке ошибок).
 *  Два кадра ожидания: FieldError появляется после setTouched на следующем
 *  рендере, а свёрнутая карточка таргетинга с ошибкой раскрывается ещё одним
 *  рендером позже (эффект в TargetingSection). Не нашли — молча выходим:
 *  текст ошибки и так виден в сводке липкой панели. */
export function scrollToFieldError(path?: string): void {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      findFieldErrorElement(path)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  });
}

export function scrollToFirstFieldError(): void {
  scrollToFieldError();
}

export function TextareaField({
  name, label, placeholder, rows = 3,
}: BaseProps & { rows?: number }) {
  const [field] = useField(name);
  return (
    <section className="ef-block">
      {label && <div className="ef-label">{label}</div>}
      <textarea
        className="ef-input ef-textarea"
        rows={rows}
        {...field}
        value={field.value ?? ''}
        placeholder={placeholder}
      />
      <FieldError name={name} />
    </section>
  );
}

export function ColorField({ name, label, fallback }: { name: string; label: string; fallback: string }) {
  const [field, , helpers] = useField(name);
  return (
    <div className="ef-field">
      <label>{label}</label>
      <input
        type="color"
        className="ef-input ef-color"
        value={field.value ?? fallback}
        onChange={(e) => helpers.setValue(e.target.value)}
      />
    </div>
  );
}

export function CheckboxField({ name, label, title }: { name: string; label: string; title?: string }) {
  const [field] = useField({ name, type: 'checkbox' });
  return (
    <label className="ef-checkbox" title={title}>
      <input type="checkbox" {...field} checked={field.value ?? false} />
      {label}
    </label>
  );
}

/** Comma-separated slug list ↔ text input, e.g. targeting.regions,
 *  sections, categories. Mirrors parseSlugList/slugListToText from the
 *  monolith. */
export function SlugListField({ name, placeholder }: { name: string; placeholder?: string }) {
  const [field, , helpers] = useField(name);
  const text = ((field.value as string[] | undefined) ?? []).join(', ');
  return (
    <input
      className="ef-input mono"
      value={text}
      onChange={(e) => {
        const arr = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
        helpers.setValue(arr.length ? arr : undefined);
      }}
      placeholder={placeholder}
    />
  );
}

export { FieldError };
