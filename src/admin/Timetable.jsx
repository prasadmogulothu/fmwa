import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ADMIN, useSession } from '../lib/auth.js';
import { clock, dayLabel } from '../data/schedule.js';
import {
  addDay,
  addProgram,
  listDays,
  listEvents,
  removeDay,
  removeProgram,
  setPublished
} from '../data/timetable.js';

function DayCard({ day, onChange, onError }) {
  const [start, setStart] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  async function add(e) {
    e.preventDefault();
    try {
      await addProgram(day.id, start, title.trim(), note.trim());
      setStart('');
      setTitle('');
      setNote('');
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  async function drop(id) {
    try {
      await removeProgram(id);
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  async function dropDay() {
    if (!window.confirm('Remove this day and all its programmes?')) return;
    try {
      await removeDay(day.id);
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <section className="ad-day">
      <div className="ad-row">
        <b>{dayLabel(day.date)}</b>
        <span className="ad-dim">{day.label}</span>
        <button type="button" className="ad-ghost" onClick={dropDay}>
          Remove day
        </button>
      </div>

      {(day.fmwa_programs || []).map((p) => (
        <div className="ad-row" key={p.id}>
          <span>{clock(p.start_time)}</span>
          <b>{p.title}</b>
          <span className="ad-dim">{p.note}</span>
          <button type="button" className="ad-ghost" onClick={() => drop(p.id)}>
            Remove
          </button>
        </div>
      ))}

      <form className="ad-grid" onSubmit={add}>
        <label>
          Start
          <input type="time" value={start} required onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Programme
          <input
            value={title}
            required
            placeholder="Suprabhatam & Abhishekam"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Note
          <input
            value={note}
            placeholder="at the pandal"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button type="submit">Add programme</button>
      </form>
    </section>
  );
}

export default function Timetable() {
  const { id } = useParams();
  const eventId = Number(id);
  const { role, userId, ready } = useSession();
  const [event, setEvent] = useState(null);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  // load() is called repeatedly (mount, publish toggle, every day/programme
  // change) rather than once in an effect, so a plain "alive" bool can't tell
  // a stale call from the current one — bump a generation counter instead and
  // drop any result that isn't from the latest call.
  const gen = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const mine = ++gen.current;
    try {
      const all = await listEvents(role === ADMIN, userId);
      const found = all.find((e) => e.id === eventId) || null;
      const nextDays = found ? await listDays(eventId) : [];
      if (gen.current !== mine) return;
      setEvent(found);
      setDays(nextDays);
      setErr('');
    } catch (e) {
      if (gen.current !== mine) return;
      setErr(e.message);
    } finally {
      if (gen.current === mine) setLoaded(true);
    }
  }, [eventId, role, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function newDay(e) {
    e.preventDefault();
    try {
      await addDay(eventId, date, label.trim());
      setDate('');
      setLabel('');
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  async function togglePublish() {
    const next = !event.timetable_published;
    try {
      await setPublished(eventId, next);
      // The write succeeded, so the banner is already true — don't leave it
      // reading "Draft" if the refresh below is the thing that fails.
      setEvent((e) => ({ ...e, timetable_published: next }));
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  // Session resolution and the first fetch are both async — render nothing
  // rather than "not assigned" while either is still in flight.
  if (!ready || !loaded) return null;

  if (!event) {
    return (
      <>
        <p className="ad-err">{err || 'That event is not assigned to you.'}</p>
        <Link to="/admin">Back to events</Link>
      </>
    );
  }

  return (
    <>
      <h2>{event.title}</h2>
      <div className="ad-row">
        <span className={event.timetable_published ? 'ad-ok' : 'ad-err'}>
          {event.timetable_published
            ? 'Published — residents can see this timetable.'
            : 'Draft — residents cannot see this timetable.'}
        </span>
        <button type="button" onClick={togglePublish}>
          {event.timetable_published ? 'Unpublish' : 'Publish'}
        </button>
      </div>

      {err && <p className="ad-err">{err}</p>}

      <form className="ad-grid" onSubmit={newDay}>
        <label>
          Date
          <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Label
          <input
            value={label}
            placeholder="Day 1 — Sthapana"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button type="submit">Add day</button>
      </form>

      {days.map((d) => (
        <DayCard key={d.id} day={d} onChange={load} onError={setErr} />
      ))}
      {!days.length && <p>No days yet. Add the first one above.</p>}
    </>
  );
}
