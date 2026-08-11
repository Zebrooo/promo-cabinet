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
