import { useCallback, useEffect, useState } from 'react';
import { ADMIN, COMMITTEE, DOMAIN, sb, useSession } from '../lib/auth.js';
import { listEvents } from '../data/timetable.js';
import { setNewsEditor } from '../data/news.js';
import PasswordField from './PasswordField.jsx';

async function call(token, method, body, query = '') {
  const r = await fetch(`/api/users${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 204) return null;
  let data = {};
  let parsed = true;
  try {
    data = await r.json();
  } catch {
    parsed = false;
  }
  if (!r.ok) throw new Error(data.error || 'Request failed.');
  if (!parsed) {
    throw new Error(
      'The user API did not return JSON. If you are running `npm run dev`, the admin Users page needs `npx vercel dev` instead — plain Vite does not run the /api functions.'
    );
  }
  return data;
}

// Anything that isn't one of the two roles this screen creates is shown
// verbatim. A new account that landed as plain `authenticated` gets no
// access and no Assignments checkboxes, and labelling it "Festival
// committee" would hide exactly that.
const roleLabel = (r) =>
  r === ADMIN ? 'Administrator' : r === COMMITTEE ? 'Festival committee' : r;

// Display only. Every account here is @fortunemeadows.local — api/users.js
// filters the list to that domain — so the domain is noise on screen. The
// full address is still what goes to and comes from the API.
const nameOf = (email) => String(email || '').split('@')[0];

function Assignments({ user, events, onError }) {
  const [mine, setMine] = useState([]);
  const [news, setNews] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from('fmwa_event_editors')
      .select('event_id')
      .eq('user_id', user.id);
    if (error) return onError(error.message);
    setMine(data.map((r) => r.event_id));
    // News access is a capability, not a per-event assignment, so it is one
    // row in its own table rather than a column here.
    const n = await sb.from('fmwa_news_editors').select('user_id').eq('user_id', user.id);
    if (n.error) return onError(n.error.message);
    setNews((n.data || []).length > 0);
  }, [user.id, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(eventId, on) {
    const q = on
      ? sb.from('fmwa_event_editors').insert({ user_id: user.id, event_id: eventId })
      : sb.from('fmwa_event_editors').delete().eq('user_id', user.id).eq('event_id', eventId);
    const { error } = await q;
    // 23505 is the (user_id, event_id) primary key: a double-tap on a phone
    // fires two inserts and the second one means already-assigned, not failed.
    if (error && error.code !== '23505') {
      if (error.code === '42501') {
        return onError('You do not have permission to change assignments.');
      }
      return onError(error.message);
    }
    load();
  }

  async function toggleNews(on) {
    try {
      await setNewsEditor(user.id, on);
      load();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div className="ad-grid">
      {events.map((e) => (
        <label key={e.id} className="ad-check">
          <input
            type="checkbox"
            checked={mine.includes(e.id)}
            onChange={(ev) => toggle(e.id, ev.target.checked)}
          />
          {e.title}
        </label>
      ))}
      <label className="ad-check">
        <input type="checkbox" checked={news} onChange={(ev) => toggleNews(ev.target.checked)} />
        News (noticeboard)
      </label>
    </div>
  );
}

export default function Users() {
  const { session, userId, ready } = useSession();
  const token = session?.access_token;
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(COMMITTEE);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loaded, setLoaded] = useState(false);
  // The id of the one row whose reset form is open, plus its field.
  const [resetting, setResetting] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await call(token, 'GET');
      setUsers(Array.isArray(data) ? data : []);
      setEvents(await listEvents(true, userId));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoaded(true);
    }
  }, [token, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    const local = username.trim().toLowerCase();
    if (!local || local.includes('@')) {
      setErr('Enter just the name before the @, not the whole address.');
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(local)) {
      setErr('Use only letters, numbers, dots, dashes and underscores — no spaces.');
      return;
    }
    const email = local + DOMAIN;
    try {
      const made = await call(token, 'POST', { email, password, role });
      setOk(`${local} created.`);
      // If GoTrue ignored the role on create, the account exists but has no
      // access — say so now rather than letting them find out at sign-in.
      if (made?.role !== role) {
        setErr(`Created, but the role came back as "${made?.role}" — they will have no access.`);
      }
      setUsername('');
      setPassword('');
      load();
    } catch (error) {
      setErr(error.message);
      setPassword('');
    }
  }

  async function drop(id, email) {
    if (!window.confirm(`Delete ${nameOf(email)}? This cannot be undone.`)) return;
    setErr('');
    try {
      await call(token, 'DELETE', null, `?id=${encodeURIComponent(id)}`);
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  function openReset(id) {
    setErr('');
    setOk('');
    setNewPassword('');
    setResetting((open) => (open === id ? '' : id));
  }

  async function reset(e, user) {
    e.preventDefault();
    setErr('');
    setOk('');
    try {
      await call(token, 'PATCH', { id: user.id, password: newPassword });
      setNewPassword('');
      setResetting('');
      setOk(`Password for ${nameOf(user.email)} changed.`);
    } catch (error) {
      setErr(error.message);
    }
  }

  // Session resolution and the first fetch are both async — render nothing
  // rather than an empty list while either is still in flight.
  if (!ready || !loaded) return null;

  return (
    <>
      <h2>Users</h2>

      <form className="ad-grid" onSubmit={create}>
        <label>
          Username
          <input
            type="text"
            value={username}
            required
            placeholder="giri"
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          Password
          <PasswordField value={password} onChange={setPassword} required minLength={8} />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value={COMMITTEE}>Festival committee</option>
            <option value={ADMIN}>Administrator</option>
          </select>
        </label>
        <button type="submit">Create user</button>
      </form>

      {err && <p className="ad-err">{err}</p>}
      {ok && <p className="ad-ok">{ok}</p>}

      {(Array.isArray(users) ? users : []).map((u) => (
        <section className="ad-day" key={u.id}>
          <div className="ad-row">
            <b>{nameOf(u.email)}</b>
            <span className="ad-dim">{roleLabel(u.role)}</span>
            <button type="button" className="ad-ghost" onClick={() => openReset(u.id)}>
              Reset password
            </button>
            {u.id !== userId && (
              <button type="button" className="ad-ghost" onClick={() => drop(u.id, u.email)}>
                Delete
              </button>
            )}
          </div>
          {resetting === u.id && (
            <form className="ad-grid" onSubmit={(e) => reset(e, u)}>
              <label>
                New password
                <PasswordField
                  value={newPassword}
                  onChange={setNewPassword}
                  required
                  minLength={8}
                />
              </label>
              <button type="submit">Save</button>
              <button type="button" className="ad-ghost" onClick={() => setResetting('')}>
                Cancel
              </button>
            </form>
          )}
          {u.role === COMMITTEE && <Assignments user={u} events={events} onError={setErr} />}
        </section>
      ))}
    </>
  );
}
