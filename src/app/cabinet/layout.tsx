import type { ReactNode } from 'react';
import { env } from '@/env';
import { CabinetNav } from '@/components/CabinetNav';
import { LogoutButton } from '@/components/LogoutButton';

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="appbar">
        <div className="brand">
          <div className="brand__mark">P</div>
          <span className="brand__name">Promo</span>
        </div>
        <CabinetNav />
        <div className="appbar__spacer" />
        <div className="appbar__right">
          <span className="envchip">S3 · <b>{env.promoBucket || '—'}</b></span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </>
  );
}
