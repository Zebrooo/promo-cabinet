'use client';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <button type="button" className="btn--ghost" onClick={logout}>Выйти</button>
  );
}
