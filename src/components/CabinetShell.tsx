'use client';

// Top strip + fixed 200px nav rail + main column.
// Layout matches Figma "01 · Analytics dashboard" exactly:
//   ┌─ 64px top strip ──────────────────────────────────────────┐
//   │ ABKHAZ · PROMO   / breadcrumb …            [user pill]    │
//   ├──────────┬─────────────────────────────────────────────────┤
//   │ 200px    │                                                 │
//   │ nav rail │  main content (page body)                       │
//   │          │                                                 │
//   └──────────┴─────────────────────────────────────────────────┘
//
// The rail is static (no hover-to-expand), matching the design's
// always-visible labels. Active state: warm pink bg + coral accent strip
// on the left + red square icon + ink text.

import React from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/LogoutButton';
import { EnvSwitch, EnvBanner } from '@/components/EnvSwitch';
import type { EnvMode } from '@/lib/env-mode';

interface NavItem {
  href: string;
  label: string;
  matchExact: boolean;
}

// Только маршруты, которые нужны юзеру каждый день. «Кампании» / «Настройки»
// из Figma пока 404. «Стайлгайд» — dev-инструмент, не показываем в nav,
// доступен по прямому /cabinet/styleguide.
const NAV_ITEMS: NavItem[] = [
  { href: '/cabinet',             label: 'Все промо',   matchExact: true  },
  { href: '/cabinet/queues',      label: 'Очереди',     matchExact: false },
  { href: '/cabinet/abkhaz-auto', label: 'Abkhaz Auto', matchExact: false },
  { href: '/cabinet/metrics',     label: 'Метрики',     matchExact: false },
];

// Map first matching nav item → breadcrumb tail text.
function breadcrumbFor(path: string): string {
  if (path.startsWith('/cabinet/queues'))      return '/ очереди';
  if (path.startsWith('/cabinet/abkhaz-auto')) return '/ abkhaz auto';
  if (path.startsWith('/cabinet/metrics'))     return '/ метрики';
  if (path === '/cabinet/new')               return '/ новое промо';
  if (path.startsWith('/cabinet/') && path !== '/cabinet') return '/ редактирование';
  return '/ все промо';
}

function TopStrip({ user, env }: { user: string; env: EnvMode }) {
  const path = usePathname();
  return (
    <div className="topstrip">
      <Link href="/cabinet" className="topstrip-brand" title="Все промо">
        ABKHAZ · PROMO
      </Link>
      <span className="topstrip-crumb">{breadcrumbFor(path)}</span>
      <div className="topstrip-spacer" />
      <EnvSwitch env={env} />
      <div className="topstrip-user" title={user}>
        <div className="topstrip-avatar">{(user[0] ?? 'A').toUpperCase()}</div>
        <span className="topstrip-name">{user}</span>
      </div>
      <LogoutButton />
    </div>
  );
}

function NavRail() {
  const path = usePathname();
  return (
    <nav className="nav-rail">
      <div className="nav-items">
        {NAV_ITEMS.map(({ href, label, matchExact }) => {
          const isActive = matchExact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-item-icon" aria-hidden />
              <span className="nav-item-label">{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="nav-version">
        <div className="nav-version-overline">ВЕРСИЯ</div>
        <div className="nav-version-num">v2.4.1</div>
      </div>
    </nav>
  );
}

// Mobile bottom-tab nav (≤720px). Mirrors Figma "04 · Mobile analytics" foot:
// 4 tabs with a small square glyph + label, the active one in coral.
const MOBILE_TABS: NavItem[] = [
  { href: '/cabinet',             label: 'Промо',   matchExact: true  },
  { href: '/cabinet/queues',      label: 'Очереди', matchExact: false },
  { href: '/cabinet/abkhaz-auto', label: 'AA',      matchExact: false },
  { href: '/cabinet/metrics',     label: 'Метрики', matchExact: false },
];

function MobileTabs() {
  const path = usePathname();
  return (
    <nav className="mobile-tabs" aria-label="Навигация">
      {MOBILE_TABS.map(({ href, label, matchExact }) => {
        const isActive = matchExact ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`mtab${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="mtab-glyph" aria-hidden />
            <span className="mtab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function CabinetShell({ children, user = 'admin', env }: { children: ReactNode; user?: string; env: EnvMode }) {
  return (
    <div className="shell">
      <TopStrip user={user} env={env} />
      <EnvBanner env={env} />
      <NavRail />
      <main className="main">
        <div className="page-body">{children}</div>
      </main>
      <MobileTabs />
    </div>
  );
}
