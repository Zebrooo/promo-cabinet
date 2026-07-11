'use client';
import { useFormikContext } from 'formik';
import type { Promo } from '@/lib/schema';
import type { PromoFormat } from '@/lib/schema';
import { FORMAT_LABEL } from '@/lib/format-labels';
import { FORMATS_BY_DEVICE, type DeviceClass } from '@zebrooo/promo-renderer';
import { queuesServing, QUEUE_META } from '@/lib/queue-formats';

// Какие форматы доступны для каждого варианта targeting.
// Union (а не intersection): на 'both' оставляем все desktop-форматы — topline
// просто отфильтруется на тач-юзерах в renderer'е (fail-safe null), но
// desktop-юзеры его увидят. Юзер сам осознанно выбирает.
function allowedFormatsFor(target: NonNullable<Promo['deviceTarget']>): readonly PromoFormat[] {
  const base = target === 'desktop' || target === 'both'
    ? FORMATS_BY_DEVICE.desktop
    : FORMATS_BY_DEVICE[target as DeviceClass];
  // 'multistep' — формат PromoRenderer с 0.10.0 (FORMATS_BY_DEVICE пакета его
  // уже содержит после бампа зависимости); до бампа (0.9.x) добавляем локально.
  // 'custom' — host-owned формат (renderer 0.14.0); пока пакет не забампан,
  // добавляем локально тем же приёмом. Доступен на desktop и touch.
  // Set-дедуп защищает от задвоения тайла при любой версии пакета.
  return [...new Set<PromoFormat>([...base, 'multistep', 'custom'])];
}

// Покажем ли warn у конкретного формата для текущего target. Пока единственный
// случай — topline на target='both' не дойдёт до тач-юзеров.
function formatCaveatFor(format: PromoFormat, target: NonNullable<Promo['deviceTarget']>): string | null {
  if (format === 'topline' && target === 'both') {
    return 'Topline не покажется на мобильных пользователях';
  }
  if (format === 'tooltip' && target === 'both') {
    return 'Tooltip не покажется на мобильных пользователях';
  }
  return null;
}

/** Device target pills + format tiles (create-only, immutable in edit) +
 *  queuesServing/isFormatMismatch hints. */
export function DevicePlacementSection({ mode }: { mode: 'create' | 'edit' }) {
  const { values, setFieldValue } = useFormikContext<Promo>();
  const currentTarget: NonNullable<Promo['deviceTarget']> = values.deviceTarget ?? 'both';
  const allowedFormats = allowedFormatsFor(currentTarget);

  return (
    <>
      {/* Device target — выбирается ПЕРВЫМ, потому что определяет, какие
          форматы доступны ниже. На touch popup рендерится как bottom-sheet,
          topline вообще не показывается. */}
      <section className="ef-block">
        <div className="ef-label">ГДЕ ПОКАЗЫВАТЬ</div>
        <div className="device-target">
          {([
            { v: 'both',    label: 'Везде',        sub: 'десктоп + мобиль' },
            { v: 'desktop', label: 'Только десктоп', sub: 'все форматы' },
            { v: 'touch',   label: 'Только мобиль',  sub: 'без topline' },
          ] as const).map((opt) => {
            const active = currentTarget === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                className={`dt-pill${active ? ' active' : ''}`}
                onClick={() => setFieldValue('deviceTarget', opt.v)}
                aria-pressed={active}
                disabled={mode === 'edit'}
              >
                <span className="dt-pill-name">{opt.label}</span>
                <span className="dt-pill-sub">{opt.sub}</span>
              </button>
            );
          })}
        </div>
        {mode === 'edit' && <div className="hint">Целевое устройство нельзя изменить после создания.</div>}
      </section>

      {/* Format tiles — фильтруются по deviceTarget */}
      <section className="ef-block">
        <div className="ef-label">ТИП ПРОМО</div>
        <div className="format-tiles">
          {allowedFormats.map((f) => {
            const active = values.format === f;
            const meta = FORMAT_LABEL[f];
            return (
              <button
                key={f}
                type="button"
                className={`fmt-tile${active ? ' active' : ''}`}
                onClick={() => setFieldValue('format', f)}
                disabled={mode === 'edit'}
                aria-pressed={active}
              >
                <span className="fmt-tile-glyph" aria-hidden />
                <span className="fmt-tile-name">{meta.name}</span>
                <span className="fmt-tile-sub">{meta.sub}</span>
              </button>
            );
          })}
        </div>
        {mode === 'edit' && <div className="hint">Формат нельзя изменить после создания.</div>}
        {currentTarget === 'touch' && (
          <div className="hint">На мобиле popup открывается шторкой снизу.</div>
        )}
        {formatCaveatFor(values.format, currentTarget) && (
          <div className="hint hint-warn">{formatCaveatFor(values.format, currentTarget)}</div>
        )}
        {(() => {
          const queues = queuesServing(values.format);
          if (queues.length === 0) return null;
          const labels = queues.map((qn) => QUEUE_META[qn]?.label ?? qn).join(', ');
          const multistepNote = values.format === 'multistep'
            ? ' (каталожные очереди этот формат сейчас не запрашивают — только cabinet-onboarding)'
            : '';
          return (
            <div className="hint">
              Формат обслуживается очередями: <b>{labels}</b>{multistepNote}.
            </div>
          );
        })()}
      </section>
    </>
  );
}

export { allowedFormatsFor };
