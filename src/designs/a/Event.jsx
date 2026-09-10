import { Link, useParams, Navigate } from 'react-router-dom';
import { useEvents } from '../../data/events.js';
import PhotoGrid from '../../components/PhotoGrid.jsx';
import { Head, Foot } from './Chrome.jsx';

export default function Event() {
  const { slug } = useParams();
  const { events, ready } = useEvents();
  const ev = events.find((e) => e.slug === slug);
  // Wait for the live list before deciding a slug is bogus.
  if (!ev) return ready ? <Navigate to="/" replace /> : null;
  const rest = events.filter((e) => e.slug !== slug);

  return (
    <div className="a" style={{ '--ac': ev.accent }}>
      <Head />

      <section className="a-eh">
        <img src={ev.cover} alt="" />
        <div className="a-eh-in">
          <span className="a-when">{ev.when}</span>
          <h1>{ev.title}</h1>
          <span className="a-te">{ev.telugu}</span>
        </div>
      </section>

      <section className="a-eb">
        <p>{ev.blurb}</p>
      </section>

      <section className="a-eg">
        <PhotoGrid photos={ev.photos} title={ev.title} />
      </section>

      <nav className="a-next">
        {rest.map((e) => (
          <Link key={e.slug} to={`/event/${e.slug}`} style={{ '--ac': e.accent }}>
            <span>{e.when}</span>
            <b>{e.title}</b>
          </Link>
        ))}
      </nav>

      <Foot />
    </div>
  );
}
