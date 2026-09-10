import { Link, useParams, Navigate } from 'react-router-dom';
import { useEvents } from '../../data/events.js';
import PhotoGrid from '../../components/PhotoGrid.jsx';
import { Head, Foot } from './Chrome.jsx';

export default function Event() {
  const { slug } = useParams();
  const { events, ready } = useEvents();
  const ev = events.find((e) => e.slug === slug);
  // Wait for the live list before deciding a slug is bogus.
  if (!ev) return ready ? <Navigate to="/b" replace /> : null;
  const rest = events.filter((e) => e.slug !== slug);

  return (
    <div className="b" style={{ '--ac': ev.accent }}>
      <Head />

      <section className="b-eh">
        <div className="b-eh-t">
          <span className="b-when">{ev.when}</span>
          <h1>{ev.title}</h1>
          <span className="b-te">{ev.telugu}</span>
          <p>{ev.blurb}</p>
        </div>
        <img src={ev.thumb} alt={ev.title} />
      </section>

      <section className="b-eg">
        <PhotoGrid photos={ev.photos} title={ev.title} />
      </section>

      <nav className="b-next">
        {rest.map((e) => (
          <Link key={e.slug} to={`/b/event/${e.slug}`} style={{ '--ac': e.accent }}>
            <span>{e.when}</span>
            <b>{e.title}</b>
          </Link>
        ))}
      </nav>

      <Foot />
    </div>
  );
}
