// Editor CSS extracted verbatim from the pre-refactor PromoForm.tsx monolith.
// Visual is unchanged — only the file it lives in moved.
export const EDITOR_CSS = `
.editor { display: flex; flex-direction: column; gap: 24px; padding: 0 0 80px; font-family: var(--font-sans); }
.editor .mono { font-family: var(--font-mono); }
.editor .hint { font-size: 12px; color: var(--app-fg4); margin-top: 6px; }
.editor .hint-warn { color: var(--brand-coral-700); font-weight: 600; }

.editor-bar {
  position: sticky; top: 64px; z-index: 9;
  background: var(--app-bg);
  margin: -24px -32px 0;
  padding: 16px 32px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border-bottom: 1px solid var(--app-border);
}
.editor-back {
  font-size: 13px; font-weight: 600; color: var(--app-fg3);
  text-decoration: none;
}
.editor-back:hover { color: var(--app-fg1); text-decoration: none; }
.editor-actions { display: flex; align-items: center; gap: 10px; }

.ebtn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 36px; padding: 0 18px; border-radius: 10px;
  font-family: inherit; font-size: 13px; font-weight: 600;
  border: 1px solid transparent; cursor: pointer;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.ebtn:disabled { opacity: .55; cursor: wait; }
.ebtn-ghost   { background: #fff; border-color: var(--app-border); color: var(--app-fg2); }
.ebtn-ghost:hover:not(:disabled) { border-color: var(--app-border2); }
.ebtn-primary { background: var(--brand-coral-600); color: #fff; }
.ebtn-primary:hover:not(:disabled) { background: var(--brand-coral-700); }
.ebtn-danger  { background: #fff; border-color: var(--brand-coral-600); color: var(--brand-coral-700); }
.ebtn-danger:hover:not(:disabled) { background: var(--brand-coral-600); color: #fff; }

/* ── AI accent button ──────────────────────────────────────── */
/* Distinct from save/publish so the action's intent is obvious. */
.ebtn-ai {
  background: linear-gradient(180deg, #16181D 0%, #3A3F48 100%);
  color: #fff;
  padding: 0 18px 0 14px;
  gap: 8px;
  box-shadow: 0 0 0 1px rgba(225,29,42,0.2), 0 1px 2px rgba(0,0,0,0.04);
}
.ebtn-ai:hover:not(:disabled) {
  background: linear-gradient(180deg, #1f2329 0%, #45495520 100%);
  box-shadow: 0 4px 12px rgba(225,29,42,0.20);
}
.ebtn-ai-spark { font-size: 14px; line-height: 1; filter: drop-shadow(0 0 4px rgba(225,29,42,0.6)); }
.ebtn-ai-error {
  background: var(--status-danger-bg); color: var(--status-danger);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px; font-weight: 600;
  max-width: 260px; line-height: 1.3;
}

/* ── AI diff panel ─────────────────────────────────────────── */
.ai-diff {
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(16,18,22,0.04), 0 4px 16px rgba(16,18,22,0.06);
}
.ai-diff-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--app-border);
  background: linear-gradient(180deg, #FBF2EF 0%, #FFFFFF 100%);
}
.ai-diff-title {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  color: var(--app-fg1);
}
.ai-diff-meta {
  display: flex; gap: 10px; align-items: center;
  margin-top: 4px;
  font-size: 11px; color: var(--app-fg4);
}
.ai-diff-cache {
  background: var(--app-surface2);
  border-radius: 999px; padding: 2px 8px;
  font-size: 10px; font-weight: 600;
}
.ai-diff-body {
  padding: 18px 20px 20px;
  display: flex; flex-direction: column; gap: 18px;
}
.ai-diff-empty {
  font-size: 13px; color: var(--app-fg3); margin: 0;
}
.ai-diff-row { display: flex; flex-direction: column; gap: 10px; }
.ai-diff-fieldname {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ai-diff-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.ai-diff-cell {
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px; line-height: 1.45;
  color: var(--app-fg1);
}
.ai-diff-cur { background: var(--app-bg);   border: 1px solid var(--app-border);  }
.ai-diff-new { background: var(--status-success-bg); border: 1px solid #BFE0CC; }
.ai-diff-celllabel {
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg4);
  margin-bottom: 4px;
}
.ai-diff-new .ai-diff-celllabel { color: var(--status-success); }
.ai-diff-celltext { white-space: pre-wrap; word-break: break-word; }
.ai-diff-empty-inline { color: var(--app-fg4); font-style: italic; }
.ai-diff-actions { display: flex; gap: 10px; }

@media (max-width: 720px) {
  .ai-diff-grid { grid-template-columns: 1fr; }
}

.editor-head h1 {
  font-size: 36px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--app-fg1); margin: 0 0 6px;
}
.editor-meta { font-size: 13px; color: var(--app-fg4); }

.editor-ai { background: #fff; border: 1px solid var(--app-border); border-radius: 14px; padding: 16px; }

.editor-grid {
  display: grid; grid-template-columns: minmax(0, 720px) 416px;
  gap: 40px;
  align-items: start;
}
.editor-main { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.editor-rail { position: sticky; top: 96px; }

/* Block primitives */
.ef-block { display: flex; flex-direction: column; gap: 10px; }
.ef-label, .ef-label-row .ef-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ef-label-row { display: flex; align-items: baseline; justify-content: space-between; }
.ef-counter { font-size: 11px; color: var(--app-fg4); }
.ef-counter.over { color: var(--status-danger); font-weight: 700; }

.ef-input {
  width: 100%; background: #fff;
  border: 1px solid var(--app-border); border-radius: 12px;
  height: 52px; padding: 0 16px;
  font-family: var(--font-sans); font-size: 15px; font-weight: 500;
  color: var(--app-fg1);
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.ef-input.mono { font-family: var(--font-mono); font-size: 13px; }
.ef-input.title { font-weight: 700; font-size: 18px; }
.ef-input:focus { outline: 0; border-color: var(--brand-sea-600); box-shadow: 0 0 0 3px var(--input-focus-ring); }
.ef-input:disabled { background: var(--app-bg); color: var(--app-fg3); cursor: not-allowed; }
.ef-textarea { height: auto; min-height: 92px; padding: 14px 16px; line-height: 1.45; resize: vertical; }
.ef-color { height: 44px; padding: 4px 6px; cursor: pointer; }

/* Device target — segmented pill row, выбирается первым */
.device-target {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
.dt-pill {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
  text-align: left; cursor: pointer;
  font-family: inherit;
  transition: background var(--dur-fast), border-color var(--dur-fast);
}
.dt-pill:hover:not(:disabled) { border-color: var(--app-border2); }
.dt-pill:disabled { opacity: 1; cursor: not-allowed; }
.dt-pill-name { font-size: 14px; font-weight: 700; color: var(--app-fg2); }
.dt-pill-sub  { font-size: 12px; font-weight: 500; color: var(--app-fg4); }
.dt-pill.active {
  background: #FDEFF0;
  border: 2px solid var(--brand-sea-700);
  padding: 13px 15px;
}
.dt-pill.active .dt-pill-name { color: var(--app-fg1); }
.dt-pill.active .dt-pill-sub  { color: var(--brand-sea-700); font-weight: 600; }

/* Format tiles — теперь auto-fit потому что количество переменное (3 или 4) */
.format-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
.fmt-tile {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 6px;
  min-height: 96px;
  cursor: pointer; text-align: left;
  font-family: inherit;
  transition: background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.fmt-tile:hover:not(:disabled) { border-color: var(--app-border2); }
.fmt-tile:disabled { opacity: 1; cursor: not-allowed; }
.fmt-tile-glyph { width: 28px; height: 18px; border-radius: 4px; background: var(--app-border2); transition: background var(--dur-fast); }
.fmt-tile-name { font-size: 15px; font-weight: 700; color: var(--app-fg2); }
.fmt-tile-sub  { font-size: 12px; font-weight: 500; color: var(--app-fg4); }
.fmt-tile.active {
  background: #FDEFF0;
  border: 2px solid var(--brand-sea-700);
  padding: 13px;  /* compensate for the extra 1px border */
}
.fmt-tile.active .fmt-tile-glyph { background: var(--brand-sea-700); }
.fmt-tile.active .fmt-tile-name  { color: var(--app-fg1); }
.fmt-tile.active .fmt-tile-sub   { color: var(--brand-sea-700); font-weight: 600; }

/* CTA row */
.ef-cta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

/* Image preview */
.ef-image-preview {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: var(--app-surface2);
  border: 1px solid var(--app-border); border-radius: 12px;
}
.ef-image-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; background: var(--app-border); }
.ef-image-meta { font-size: 12px; color: var(--app-fg3); word-break: break-all; }

/* Queue chips */
.ef-queues { display: flex; flex-wrap: wrap; gap: 8px; }
.qchip {
  display: inline-flex; align-items: center;
  height: 32px; padding: 0 16px; border-radius: 999px;
  background: #fff; border: 1px solid var(--app-border);
  color: var(--app-fg2);
  font-family: inherit; font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast);
}
.qchip:hover:not(:disabled) { border-color: var(--app-border2); }
.qchip:disabled { opacity: .6; cursor: not-allowed; }
.qchip.on {
  background: var(--brand-sea-700); border-color: var(--brand-sea-700);
  color: #fff;
}

/* Targeting filters */
.ef-flt-list { display: flex; flex-direction: column; gap: 10px; }
.ef-flt-card {
  border: 1px solid var(--app-border); border-radius: 12px;
  background: var(--app-bg); overflow: hidden;
}
.ef-flt-card.is-open { border-color: var(--app-border2); }
.ef-flt-head { display: flex; align-items: center; }
.ef-flt-title {
  flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px;
  padding: 12px 14px; background: none; border: 0; cursor: pointer;
  font-family: inherit; text-align: left;
}
.ef-flt-title:hover { background: var(--app-surface2); }
.ef-flt-name { font-size: 13px; font-weight: 600; color: var(--app-fg1); }
.ef-flt-summary {
  font-size: 12px; color: var(--app-fg3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ef-flt-remove {
  background: none; border: 0; cursor: pointer;
  padding: 12px 14px; font-size: 13px; color: var(--app-fg4);
}
.ef-flt-remove:hover { color: var(--app-fg1); }
.ef-flt-body {
  padding: 4px 14px 16px;
  display: flex; flex-direction: column; gap: 14px;
}
.ef-flt-add {
  align-self: flex-start;
  padding: 10px 14px; border-radius: 10px;
  border: 1px dashed var(--app-border2); background: none;
  font-family: inherit; font-size: 13px; font-weight: 600; color: var(--app-fg2);
  cursor: pointer;
}
.ef-flt-add:hover { background: var(--app-surface2); color: var(--app-fg1); }
.ef-flt-catalog {
  border: 1px solid var(--app-border2); border-radius: 12px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 12px;
  background: var(--app-bg);
}
.ef-flt-catalog-head { display: flex; align-items: center; gap: 6px; }
.ef-flt-catalog-head .ef-input { flex: 1; height: 36px; font-size: 13px; }
.ef-flt-group { display: flex; flex-direction: column; gap: 2px; }
.ef-flt-option {
  display: flex; align-items: baseline; gap: 8px;
  padding: 7px 8px; border: 0; border-radius: 8px; background: none;
  font-family: inherit; font-size: 13px; color: var(--app-fg1);
  text-align: left; cursor: pointer;
}
.ef-flt-option:hover:not(:disabled) { background: var(--app-surface2); }
.ef-flt-option:disabled { color: var(--app-fg4); cursor: not-allowed; }
.ef-flt-added { font-size: 11px; color: var(--app-fg4); }
.ef-flt-empty { font-size: 13px; color: var(--app-fg3); }
.ef-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.ef-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ef-field label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ef-field .ef-input { height: 40px; font-size: 13px; }
.ef-field .ef-input.mono { font-size: 12px; }
.ef-checkbox-row { display: flex; gap: 18px; flex-wrap: wrap; }
.ef-checkbox {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 500; color: var(--app-fg2);
  cursor: pointer;
}
.ef-checkbox.is-disabled { opacity: .45; cursor: not-allowed; }
.ef-divider { height: 1px; background: var(--app-border); margin: 4px 0; }

/* Segmented control — popup variant + textAlign */
.ef-segment {
  display: flex; gap: 8px;
  flex-wrap: wrap;
}
.ef-segment-btn {
  display: inline-flex; flex-direction: column; gap: 2px;
  padding: 10px 14px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: border-color .12s, background .12s;
  min-width: 120px;
}
.ef-segment-btn:hover { background: var(--app-bg-elev); }
.ef-segment-btn.is-active {
  border-color: var(--app-accent);
  background: var(--app-accent-soft, rgba(225,29,42,0.06));
}
.ef-segment-name {
  font-size: 13px; font-weight: 700; color: var(--app-fg);
}
.ef-segment-sub {
  font-size: 11px; font-weight: 500; color: var(--app-fg2);
}

/* Multistep steps repeater */
.ef-steps { display: flex; flex-direction: column; gap: 12px; }
.ef-step {
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 12px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.ef-step-head { display: flex; align-items: center; justify-content: space-between; }
.ef-step-num {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--app-fg3);
}
.ef-step-tools { display: flex; gap: 6px; }
.ef-step-btn {
  width: 28px; height: 28px; border-radius: 8px;
  background: #fff; border: 1px solid var(--app-border);
  color: var(--app-fg3); font: 600 13px var(--font-sans);
  cursor: pointer;
  transition: border-color var(--dur-fast), color var(--dur-fast);
}
.ef-step-btn:hover:not(:disabled) { border-color: var(--app-border2); color: var(--app-fg1); }
.ef-step-btn:disabled { opacity: .35; cursor: not-allowed; }
.ef-step-btn.danger:hover:not(:disabled) { border-color: var(--brand-coral-600); color: var(--brand-coral-700); }
.ef-step-add {
  align-self: flex-start;
  display: inline-flex; align-items: center;
  height: 36px; padding: 0 16px; border-radius: 10px;
  background: #fff; border: 1px dashed var(--app-border2);
  color: var(--app-fg2); font: 600 13px var(--font-sans);
  cursor: pointer;
  transition: border-color var(--dur-fast), color var(--dur-fast);
}
.ef-step-add:hover:not(:disabled) { border-color: var(--brand-sea-600); color: var(--app-fg1); }
.ef-step-add:disabled { opacity: .5; cursor: not-allowed; }

/* Gradient picker row */
.ef-gradient-row {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.ef-gradient-row .ef-color { width: 60px; height: 44px; flex-shrink: 0; }
/* Мелкий вспомогательный текст, который ДОЛЖЕН оставаться в потоке
   (мини-подписи полей шагов, URL, компактные строки-статусы). Поясняющие
   же тексты живут в HintIcon (.hint-*) — по клику, не в потоке. */
.ef-sublabel {
  font-weight: 500; color: var(--app-fg2); font-size: 11.5px;
}

/* HintIcon: иконка (i) у заголовка поля/группы, текст — popover по клику. */
.hint-wrap { position: relative; display: inline-flex; margin-left: 6px; vertical-align: middle; }
.hint-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  border: 1px solid var(--app-border2); background: #fff;
  color: var(--app-fg2);
  font: italic 700 10.5px/1 Georgia, serif;
  cursor: pointer; padding: 0;
}
.hint-icon:hover, .hint-icon[aria-expanded="true"] {
  border-color: var(--brand-sea-700); color: var(--brand-sea-700);
}
.hint-popover {
  position: absolute; z-index: 30; top: calc(100% + 6px); left: -8px;
  width: max-content; max-width: 320px;
  background: #fff; border: 1px solid var(--app-border);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, .12);
  padding: 10px 12px;
  font-weight: 500; color: var(--app-fg2); font-size: 11.5px; line-height: 1.5;
  white-space: normal; text-align: left; text-transform: none; letter-spacing: normal;
}
.ef-link-btn {
  background: none; border: 0; padding: 4px 0;
  color: var(--app-fg2); font: 600 12px var(--font-sans);
  cursor: pointer; text-decoration: underline;
}
.ef-link-btn:hover { color: var(--app-accent); }

.ef-error {
  background: var(--status-danger-bg); color: var(--status-danger);
  border-radius: 10px; padding: 12px 16px;
  font-size: 13px; font-weight: 600;
}

/* Preview rail */
.prev-panel {
  background: #16181D; border-radius: 20px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 16px;
  min-height: 740px;
}
.prev-overline {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  color: var(--app-fg4);
}
.prev-devices {
  display: inline-flex; background: var(--app-fg2);
  border-radius: 999px; padding: 4px; gap: 4px;
  align-self: flex-start;
}
.prev-device {
  height: 24px; padding: 0 12px; border-radius: 999px;
  background: transparent; border: 0;
  font-family: inherit; font-size: 11px; font-weight: 600;
  color: var(--app-fg4); cursor: pointer;
}
.prev-device.on { background: #fff; color: var(--app-fg1); }
.prev-frame {
  flex: 1; min-height: 480px;
  background: var(--app-bg); border: 4px solid var(--app-fg2);
  border-radius: 28px;
  overflow: auto;
  padding: 20px;
  display: flex; align-items: flex-start; justify-content: center;
}
.prev-frame.device-mobile  { max-width: 280px; align-self: center; }
.prev-frame.device-tablet  { max-width: 560px; align-self: center; }
.prev-frame.device-desktop { max-width: 100%;  align-self: stretch; }
.prev-foot { display: flex; flex-direction: column; gap: 4px; }
.prev-slot { font-size: 13px; color: #fff; }
.prev-reach { font-size: 18px; font-weight: 700; color: var(--brand-coral-300); margin-top: 4px; }
.prev-reach-sub { font-size: 11px; color: var(--app-fg4); margin-top: 4px; }

/* Responsive */
@media (max-width: 1080px) {
  .editor-grid { grid-template-columns: 1fr; }
  .editor-rail { position: static; }
}
@media (max-width: 720px) {
  .editor-bar { top: 56px; }
  .format-tiles { grid-template-columns: repeat(2, 1fr); }
  .device-target { grid-template-columns: 1fr; }
  .ef-cta-row { grid-template-columns: 1fr; }
  .editor-head h1 { font-size: 28px; }
}
`;
