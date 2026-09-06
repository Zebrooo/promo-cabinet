import { describe, expect, it } from 'vitest';
import { EDITOR_CSS } from './editor-styles';

describe('editor sticky action bar geometry', () => {
  it('sits below the fixed CabinetShell strip on desktop and mobile', () => {
    expect(EDITOR_CSS).toMatch(/\.editor-bar\s*\{[^}]*top:\s*64px/);
    expect(EDITOR_CSS).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*\.editor-bar\s*\{\s*top:\s*56px;?\s*\}/,
    );
  });

  it('does not reset the editor bar to the viewport top', () => {
    expect(EDITOR_CSS).not.toMatch(/\.editor-bar\s*\{[^}]*top:\s*0(?:px)?\s*[;}]/);
  });
});

describe('topline preview bridge for promo-renderer 0.14', () => {
  it('renders the configured CTA label and colors only through the explicit 0.14 bridge', () => {
    expect(EDITOR_CSS).toContain('--promo-preview-cta-bg');
    expect(EDITOR_CSS).toContain('--promo-preview-cta-color');
    expect(EDITOR_CSS).toMatch(
      /\[data-format=topline\]\[data-topline-cta-bridge=true\][\s\S]*\.zr-topline::after\s*\{[^}]*content:\s*var\(--promo-preview-cta-label\)/,
    );
    expect(EDITOR_CSS).not.toContain(':has(');
  });

  it('shows an explicit description color without renderer opacity blending', () => {
    expect(EDITOR_CSS).toMatch(
      /\[data-format=topline\]\[data-has-description-color=true\][\s\S]*\.zr-topline__description\s*\{[^}]*opacity:\s*1/,
    );
  });

  it('keeps the selected two-column topline layout in the live preview', () => {
    expect(EDITOR_CSS).toMatch(
      /\[data-format=topline\] \.zr-topline\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
    );
    expect(EDITOR_CSS).toMatch(/\.zr-topline::after,[^}]*min-height:\s*44px;/);
  });
});

describe('гидратация <style>', () => {
  // Стилевая строка уезжает в <style>{EDITOR_CSS}</style>. React экранирует
  // < > & ' " в текстовом узле ТОЛЬКО на сервере, на клиенте оставляет как
  // есть — узлы не сходятся, и редактор целиком перерисовывается заново.
  // Ловилось дважды: апостроф в комментарии и [aria-expanded="true"].
  // Селекторы атрибутов пишем без кавычек: [aria-expanded=true].
  it('не содержит символов, которые React экранирует на сервере', () => {
    const offenders = [...EDITOR_CSS.matchAll(/["'<>&]/g)].map((m) => ({
      char: m[0],
      context: EDITOR_CSS.slice(Math.max(0, m.index - 40), m.index + 10),
    }));
    expect(offenders).toEqual([]);
  });
});
