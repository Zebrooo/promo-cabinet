import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/CabinetShell';

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return <CabinetShell>{children}</CabinetShell>;
}
