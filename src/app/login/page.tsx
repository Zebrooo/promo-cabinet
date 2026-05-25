'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });
    if (res.ok) router.push('/cabinet');
    else setError('Неверный логин или пароль');
  }

  return (
    <main>
      <h1>Вход в кабинет</h1>
      <form onSubmit={submit}>
        <label htmlFor="user">Логин</label>
        <input id="user" value={user} onChange={(e) => setUser(e.target.value)} />
        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <p><button type="submit">Войти</button></p>
      </form>
    </main>
  );
}
