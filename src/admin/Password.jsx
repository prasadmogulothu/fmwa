import { useState } from 'react';
import { sb } from '../lib/auth.js';
import PasswordField from './PasswordField.jsx';

// api/users.js keeps its own copy of this number (MIN_PASSWORD) because that
// serverless file cannot import from the browser bundle. The two are meant to
// match — change one, change the other.
const MIN_PASSWORD = 8;

export default function Password() {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    if (!next || !confirm) {
      setErr('Enter the new password twice.');
      return;
    }
    if (next !== confirm) {
      setErr('Those two passwords do not match.');
      return;
    }
    if (next.length < MIN_PASSWORD) {
      setErr(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) {
        setErr(error.message || 'Could not change the password.');
      } else {
        // updateUser on the caller's own session does not invalidate it, so
        // there's no sign-out to handle here.
        setNext('');
        setConfirm('');
        setOk('Password changed.');
      }
    } catch (error) {
      setErr(error.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Change password</h2>

      {/* No required/minLength here on purpose: those are native constraints
          that would block the click before the ordered checks below ever
          run, and it's this file's own messages that must show up. */}
      <form className="ad-grid" onSubmit={save}>
        <label>
          New password
          <PasswordField value={next} onChange={setNext} />
        </label>
        <label>
          Confirm new password
          <PasswordField value={confirm} onChange={setConfirm} />
        </label>
        <button type="submit" disabled={busy}>
          Save
        </button>
      </form>

      {err && <p className="ad-err">{err}</p>}
      {ok && <p className="ad-ok">{ok}</p>}
    </>
  );
}
