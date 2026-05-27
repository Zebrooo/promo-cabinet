'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/LogoutButton';

// ── Tiny inline SVG icons (Lucide-style, stroke 1.75, 18×18) ──────────────

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h18M3 6h18M3 18h12"/>
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}

// ── Nav rail items config ──────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchExact: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/cabinet',        label: 'Все промо',  icon: <IconGrid />,   matchExact: true  },
  { href: '/cabinet/queues', label: 'Очереди',    icon: <IconLayers />, matchExact: false },
];

// ── CabinetNav (uses pathname, rendered inside CabinetShell) ──────────────

function CabinetNav() {
  const path = usePathname();

  return (
    <nav className="nav-rail">
      {/* Logo / wordmark */}
      <div className="nav-logo" style={{ pointerEvents: 'none' }}>
        <div className="mark">
          <IconSparkle />
        </div>
        <span className="wordmark">Промо · Абхаз Авто</span>
      </div>

      {/* Nav items */}
      <div className="nav-items">
        <div className="nav-section-label">КАТАЛОГ</div>
        {NAV_ITEMS.map(({ href, label, icon, matchExact }) => {
          const isActive = matchExact
            ? path === href
            : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item${isActive ? ' active' : ''}`}
              title={label}
            >
              {icon}
              <span className="label">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom: user + logout */}
      <div className="nav-bottom">
        <div className="nav-user" title="admin">
          <div className="avatar">A</div>
          <span className="uname">admin</span>
        </div>
        <LogoutButton />
      </div>
    </nav>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────

function Topbar() {
  const path = usePathname();

  // Derive current section label from route
  let section = 'Все промо';
  if (path.startsWith('/cabinet/queues')) section = 'Очереди';
  else if (path.startsWith('/cabinet/new'))   section = 'Новое промо';
  else if (path.startsWith('/cabinet/'))      section = 'Промо';

  return (
    <div className="topbar">
      <div className="breadcrumb">
        <span>Промо-кабинет</span>
        <IconChevronRight />
        <span className="cur">{section}</span>
      </div>
      <div className="spacer" />
    </div>
  );
}

// ── CabinetShell (client shell: hover-to-expand) ──────────────────────────

export function CabinetShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`shell${open ? ' nav-open' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <CabinetNav />
      <main className="main">
        <Topbar />
        <div className="page-body">
          {children}
        </div>
      </main>
    </div>
  );
}
