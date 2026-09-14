import { useState } from 'react';
import { signIn } from '../lib/auth.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { error } = await signIn(email.trim(), password);
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
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
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
