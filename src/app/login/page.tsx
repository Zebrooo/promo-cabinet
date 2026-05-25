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
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <div className="brand__mark">P</div>
          <span className="brand__name">PROMO·<b>QUEUE</b></span>
        </div>
        <h1>Вход в кабинет</h1>
        <p className="sub">Управление очередью промо · S3-каталог</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="user">Логин</label>
            <input id="user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary">Войти →</button>
        </form>
      </div>
    </div>
  );
}
