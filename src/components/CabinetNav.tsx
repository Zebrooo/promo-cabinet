'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CabinetNav() {
  const path = usePathname();
  const onQueue = path.startsWith('/cabinet/queue');
  return (
    <nav className="nav">
      <Link href="/cabinet" className={`nav__tab ${onQueue ? '' : 'is-active'}`}>Список</Link>
      <Link href="/cabinet/queue" className={`nav__tab ${onQueue ? 'is-active' : ''}`}>Очередь</Link>
    </nav>
  );
}
