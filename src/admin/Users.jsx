import { useCallback, useEffect, useState } from 'react';
import { ADMIN, COMMITTEE, DOMAIN, sb, useSession } from '../lib/auth.js';
import { listEvents } from '../data/timetable.js';

async function call(token, method, body, query = '') {
  const r = await fetch(`/api/users${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// Anything that isn't one of the two roles this screen creates is shown
// verbatim. A new account that landed as plain `authenticated` gets no
// access and no Assignments checkboxes, and labelling it "Festival
// committee" would hide exactly that.
const roleLabel = (r) =>
  r === ADMIN ? 'Administrator' : r === COMMITTEE ? 'Festival committee' : r;

function Assignments({ user, events, onError }) {
  const [mine, setMine] = useState([]);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from('fmwa_event_editors')
      .select('event_id')
      .eq('user_id', user.id);
    if (error) return onError(error.message);
    setMine(data.map((r) => r.event_id));
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

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setUsers(await call(token, 'GET'));
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
      setOk(`${email} created.`);
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
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return;
    setErr('');
    try {
      await call(token, 'DELETE', null, `?id=${encodeURIComponent(id)}`);
      load();
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="text"
              value={username}
              required
              placeholder="giri"
              onChange={(e) => setUsername(e.target.value)}
            />
            <span className="ad-dim">{DOMAIN}</span>
          </span>
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            required
            minLength={10}
            onChange={(e) => setPassword(e.target.value)}
          />
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

      {users.map((u) => (
        <section className="ad-day" key={u.id}>
          <div className="ad-row">
            <b>{u.email}</b>
            <span className="ad-dim">{roleLabel(u.role)}</span>
            {u.id !== userId && (
              <button type="button" className="ad-ghost" onClick={() => drop(u.id, u.email)}>
                Delete
              </button>
            )}
          </div>
          {u.role === COMMITTEE && <Assignments user={u} events={events} onError={setErr} />}
        </section>
      ))}
    </>
  );
}
