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
    <div className="login-shell">
      {/* Left — dark teal panel */}
      <div className="login-panel">
        <div className="brand">
          <div className="mark">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <div>
            <div className="nm">Промо-кабинет</div>
            <div className="sub">Абхаз Авто</div>
          </div>
        </div>
        <div className="stripes">
          <div className="s" style={{ background: '#E11D2A', width: '72%' }} />
          <div className="s" style={{ background: '#B89673', width: '48%' }} />
          <div className="s" style={{ background: '#DF5530', width: '84%' }} />
        </div>
        <div className="footer-copy">© Абхаз Авто · 2026</div>
      </div>

      {/* Right — form area */}
      <div className="login-form-area">
        <h2>Вход</h2>
        <p className="sub">Только для администраторов</p>
        <form className="login-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="user">Логин</label>
            <input
              id="user"
              className="input"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg">Войти →</button>
        </form>
      </div>
    </div>
  );
}
