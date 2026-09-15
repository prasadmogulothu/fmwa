import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ADMIN, useSession } from '../lib/auth.js';
import { listEvents, listPhotos, removePhoto, setPhotoYear } from '../data/timetable.js';
import ImagePicker from './ImagePicker.jsx';

// The photo gallery for one event. Reachable by an admin and by a committee
// member the event is assigned to — RLS decides which, not this screen.

// Which year a new upload belongs to. Festivals run late in the year and the
// committee uploads during or just after, so the current year is nearly always
// right; the two years either side cover an upload in early January and a
// backfill of last year's photos.
const yearChoices = () => {
  const now = new Date().getFullYear();
  return [now + 1, now, now - 1, now - 2];
};

export default function Gallery() {
  const { id } = useParams();
  const eventId = Number(id);
  const { role, userId, ready } = useSession();
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  // Same generation guard as Timetable.jsx: load() runs on mount and after
  // every upload or delete, so a stale result must not overwrite a newer one.
  const gen = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const mine = ++gen.current;
    try {
      const all = await listEvents(role === ADMIN, userId);
      const found = all.find((e) => e.id === eventId) || null;
      const next = found ? await listPhotos(eventId) : [];
      if (gen.current !== mine) return;
      setEvent(found);
      setPhotos(next);
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

  async function drop(photo) {
    if (!window.confirm('Remove this photo from the gallery?')) return;
    try {
      await removePhoto(photo.id);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function retag(photo, next) {
    try {
      await setPhotoYear(photo.id, next);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

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
      <h2>{event.title} — photos</h2>
      {/* The gallery has no publish switch: unlike the timetable, a photo is
          visible to residents as soon as it is uploaded. Say so rather than
          let someone assume the timetable's Draft state covers this too. */}
      <p className="ad-dim">
        Photos appear on the public event page straight away — there is no draft state for the
        gallery.
      </p>

      {err && <p className="ad-err">{err}</p>}

      <div className="ad-row">
        <label>
          Year for new photos
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearChoices().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ImagePicker
        eventId={eventId}
        target="gallery"
        year={year}
        label={`Add a photo to ${year}`}
        onDone={load}
      />

      {!photos.length && <p>No photos yet. Add the first one above.</p>}

      <div className="ad-shots">
        {photos.map((p) => (
          <figure key={p.id}>
            <img src={p.url} alt={p.caption || ''} loading="lazy" />
            <figcaption>
              <select value={p.year || ''} onChange={(e) => retag(p, Number(e.target.value))}>
                {/* An existing photo may carry a year older than the choices
                    above, so make sure its own value is always present. */}
                {[...new Set([...yearChoices(), p.year].filter(Boolean))]
                  .sort((a, b) => b - a)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>
              <button type="button" className="ad-ghost" onClick={() => drop(p)}>
                Remove
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
