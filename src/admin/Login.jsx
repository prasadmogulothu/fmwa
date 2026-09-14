import { useState } from 'react';
import { DOMAIN, signIn } from '../lib/auth.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const local = username.trim().toLowerCase();
    if (!local || local.includes('@')) {
      setErr('Enter just your username, without the @fortunemeadows.local part.');
      setBusy(false);
      return;
    }
    try {
      const { error } = await signIn(local + DOMAIN, password);
      // Deliberately vague: a precise message tells an attacker which half was
      // right. The committee only ever has one account each anyway.
      if (error) setErr('That email and password did not match.');
    } catch {
      setErr('That email and password did not match.');
    }
    setBusy(false);
  }

  return (
    <div className="ad-login">
      <form className="ad-card" onSubmit={submit}>
        <h1>Fortune Meadows</h1>
        <p>Committee sign in</p>
        <label>
          Username
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="text"
              autoComplete="username"
              value={username}
              required
              onChange={(e) => setUsername(e.target.value)}
            />
            <span className="ad-dim">{DOMAIN}</span>
          </span>
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {err && <p className="ad-err">{err}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
