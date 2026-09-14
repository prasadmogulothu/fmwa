import { useState } from 'react';
import { signIn } from '../lib/auth.js';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Deliberately vague: a precise message tells an attacker which half was
  // right. Identical on both branches below so neither half is ever disclosed.
  const WRONG = 'That username and password did not match.';
  const OFFLINE = 'Could not reach the server. Check your connection and try again.';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { error } = await signIn(username, password);
      // supabase-js returns an error object for a dropped request too, so
      // someone on bad signal would otherwise be told their password is wrong.
      if (error)
        setErr(error.name === 'AuthRetryableFetchError' || !error.status ? OFFLINE : WRONG);
    } catch {
      setErr(WRONG);
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
          <input
            type="text"
            autoComplete="username"
            value={username}
            required
            onChange={(e) => setUsername(e.target.value)}
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
