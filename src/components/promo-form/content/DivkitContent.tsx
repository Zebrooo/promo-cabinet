'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import { FieldError } from '../fields';

/** divkit: divkitUrl, divkitJson (transit preview-only) — ничего больше. */
export function DivkitContent() {
  const { values, setFieldValue } = useFormikContext<Promo>();
  return (
    <section className="ef-field" style={{ gridColumn: '1 / -1' }}>
      <label>
        DivKit JSON
        <span className="ef-hint">
          {values.divkitUrl
            ? ' (загружено в S3, можно отредактировать и пересохранить)'
            : ' (улетит в S3 при «Сохранить промо»)'}
        </span>
      </label>
      <textarea
        className="ef-input"
        rows={12}
        placeholder={'{\n  "card": {\n    "log_id": "promo_001",\n    "states": [\n      {\n        "state_id": 0,\n        "div": {\n          "type": "container",\n          "items": [\n            { "type": "text", "text": "Заголовок", "font_size": 24 }\n          ]\n        }\n      }\n    ]\n  }\n}'}
        value={values.divkitJson ? JSON.stringify(values.divkitJson, null, 2) : ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw.trim()) {
            setFieldValue('divkitJson', undefined);
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            setFieldValue('divkitJson', parsed);
            setFieldValue('divkitUrl', undefined);
          } catch {
            // Невалидный JSON — игнорируем save в state, юзер увидит
            // подсказку ниже и поправит.
          }
        }}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}
      />
      {!values.divkitJson && !values.divkitUrl && (
        <span className="ef-hint" style={{ color: 'var(--app-fg2)' }}>
          Вставьте корректный DivKit JSON-tree. После сохранения промо файл уедет в S3.
        </span>
      )}
      {values.divkitUrl && (
        <span className="ef-hint">
          URL: <a href={values.divkitUrl} target="_blank" rel="noreferrer">{values.divkitUrl}</a>
        </span>
      )}
      <FieldError name="divkitJson" />
    </section>
  );
}
