import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CabinetShell } from './CabinetShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/cabinet/push',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('CabinetShell push navigation', () => {
  it('exposes Push campaigns in desktop and mobile navigation with an active breadcrumb', () => {
    const html = renderToStaticMarkup(<CabinetShell env="prod"><div>body</div></CabinetShell>);
    expect(html.match(/href="\/cabinet\/push"/g)).toHaveLength(2);
    expect(html).toContain('/ push-рассылки');
    expect(html).toContain('Push‑рассылки');
    expect(html).toContain('aria-current="page"');
  });

  it('gives all six mobile destinations an explicit column', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))');
  });

  it('keeps shell controls touch-sized and keyboard-visible on mobile', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    expect(css).toMatch(/@media \(max-width: 720px\), \(pointer: coarse\) \{[\s\S]*?\.env-switch-tab \{ min-width: 44px; height: 44px;/);
    expect(css).toMatch(/@media \(max-width: 720px\), \(pointer: coarse\) \{[\s\S]*?\.topstrip-logout \{ width: 44px; height: 44px;/);
    expect(css).toContain(':where(.topstrip-brand, .env-switch-tab, .nav-item, .mtab, .btn):focus-visible');
  });
});
