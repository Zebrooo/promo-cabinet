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
