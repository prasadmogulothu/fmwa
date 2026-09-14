import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN, useSession } from '../lib/auth.js';
import { listEvents } from '../data/timetable.js';

export default function EventList() {
  const { role, userId } = useSession();
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!userId) return;
    listEvents(role === ADMIN, userId)
      .then(setEvents)
      .catch((e) => setErr(e.message));
  }, [role, userId]);

  return (
    <>
      <h2>Events</h2>
      {err && <p className="ad-err">{err}</p>}
      {!err && !events.length && <p>No events are assigned to you yet.</p>}
      {events.map((e) => (
        <div className="ad-row" key={e.id}>
          <Link to={`/admin/event/${e.id}`}>{e.title}</Link>
          <span className={e.timetable_published ? 'ad-ok' : 'ad-err'}>
            {e.timetable_published ? 'Published' : 'Draft'}
          </span>
        </div>
      ))}
    </>
  );
}
