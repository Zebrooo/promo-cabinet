import type { ReactNode } from 'react';
import { env } from '@/env';
import { LogoutButton } from '@/components/LogoutButton';

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="appbar">
        <div className="brand">
          <div className="brand__mark">P</div>
          <span className="brand__name">PROMO·<b>QUEUE</b></span>
        </div>
        <div className="appbar__right">
          <span className="envchip mono">S3 · <b>{env.promoBucket || '—'}</b></span>
          <LogoutButton />
        </div>
      </header>
      {children}
    </>
  );
}
