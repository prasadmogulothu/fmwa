import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN, useSession } from '../lib/auth.js';
import { listEvents } from '../data/timetable.js';

export default function EventList() {
  const { role, userId, ready } = useSession();
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    listEvents(role === ADMIN, userId)
      .then(setEvents)
      .catch((e) => setErr(e.message))
      .finally(() => setLoaded(true));
  }, [role, userId]);

  // Session resolution and the first fetch are both async — render nothing
  // rather than "no events" while either is still in flight, so a signed-in
  // committee member is never shown a false access-denied message.
  if (!ready || !loaded) return null;

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
          {/* A Link, not a button with navigate(), so middle-click and
              open-in-new-tab still work. */}
          <Link className="ad-ghost ad-btn" to={`/admin/event/${e.id}`}>
            Manage
          </Link>
          <Link className="ad-ghost ad-btn" to={`/admin/event/${e.id}/photos`}>
            Photos
          </Link>
        </div>
      ))}
    </>
  );
}
