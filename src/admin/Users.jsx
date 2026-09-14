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
    if (error) return onError(error.message);
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
    const email = local + DOMAIN;
    try {
      await call(token, 'POST', { email, password, role });
      setOk(`${email} created.`);
      setUsername('');
      setPassword('');
      load();
    } catch (error) {
      setErr(error.message);
      setPassword('');
    }
  }

  async function drop(id) {
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
            <span className="ad-dim">
              {u.role === ADMIN ? 'Administrator' : 'Festival committee'}
            </span>
            {u.id !== userId && (
              <button type="button" className="ad-ghost" onClick={() => drop(u.id)}>
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
