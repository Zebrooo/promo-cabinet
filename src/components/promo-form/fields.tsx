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
  if (!meta.touched || !meta.error) return null;
  return <div className="hint hint-warn">{meta.error}</div>;
}

export function TextField({
  name, label, placeholder, className, maxLength, mono, title,
}: BaseProps & { mono?: boolean; title?: boolean }) {
  const [field] = useField(name);
  return (
    <section className="ef-block">
      {label && <div className="ef-label">{label}</div>}
      <input
        className={`ef-input${mono ? ' mono' : ''}${title ? ' title' : ''}${className ? ` ${className}` : ''}`}
        {...field}
        value={field.value ?? ''}
        placeholder={placeholder}
        maxLength={maxLength}
      />
      <FieldError name={name} />
    </section>
  );
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

export function SegmentField<T extends string>({
  name, options,
}: {
  name: string;
  options: readonly { v: T; name: string; sub: string }[];
}) {
  const [field, , helpers] = useField(name);
  return (
    <div className="ef-segment">
      {options.map(({ v, name: optName, sub }) => {
        const active = field.value === v;
        return (
          <button
            type="button"
            key={v}
            className={`ef-segment-btn${active ? ' is-active' : ''}`}
            onClick={() => helpers.setValue(v)}
            aria-pressed={active}
          >
            <span className="ef-segment-name">{optName}</span>
            <span className="ef-segment-sub">{sub}</span>
          </button>
        );
      })}
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
