import { Link } from 'react-router-dom';
import { useEvents } from '../../data/events.js';
import { BODY_YEAR, OFFICE, MEMBERS, CONGRATS } from '../../data/committee.js';
import { Head, Foot } from './Chrome.jsx';

export default function Home() {
  const { events } = useEvents();

  return (
    <div className="b">
      <Head />

      <section className="b-hero">
        <div className="b-hero-t">
          <span className="b-est">Colony welfare association, est. 2017</span>
          <h1>
            Fortune Meadows
            <span>Welfare Association</span>
          </h1>
          <p>
            An elected committee, three festivals a year, and a colony that turns out for every
            one of them.
          </p>
          <ul className="b-chips">
            {events.map((e) => (
              <li key={e.slug} style={{ '--ac': e.accent }}>
                <Link to={`/b/event/${e.slug}`}>
                  <img src={e.thumb} alt="" loading="lazy" />
                  <b>{e.title}</b>
                  <i>{e.when}</i>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <figure className="b-hero-img">
          <img src="/assets/banner.png" alt="The main gate of Fortune Meadows" />
        </figure>
      </section>

      <section className="b-about">
        <blockquote>
          Nobody here celebrates alone. The gate gets a flag, the plot gets an uri, and the
          pandal gets nine days.
        </blockquote>
        <div className="b-about-t">
          <p>
            Fortune Meadows Welfare Association was started in <b>2017</b> by the residents of the
            colony. <b>K. V. Rajashekar</b> was elected president, and an executive committee was formed
            with him.
          </p>
          <p>
            Between them they look after water, security, the park and the common areas — and
            they organise the three festivals below.
          </p>
        </div>
      </section>


      <section className="b-body">
        <div className="b-body-h">
          <h2>{BODY_YEAR} Elected Body</h2>
          <p>{CONGRATS}</p>
        </div>
        <dl className="b-office">
          {OFFICE.map(([role, name]) => (
            <div key={role}>
              <dt>{role}</dt>
              <dd>{name}</dd>
            </div>
          ))}
        </dl>
        <div className="b-exec">
          <h3>Executive committee</h3>
          <ul>
            {MEMBERS.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="b-fest">
        <h2>Festivals</h2>
        {events.map((e) => (
          <Link className="b-panel" key={e.slug} to={`/b/event/${e.slug}`} style={{ '--ac': e.accent }}>
            <span className="b-panel-img">
              <img src={e.thumb} alt="" loading="lazy" />
            </span>
            <span className="b-panel-t">
              <span className="b-when">{e.when}</span>
              <h3>{e.title}</h3>
              <span className="b-te">{e.telugu}</span>
              <span className="b-line">{e.line}</span>
              <span className="b-cta">
                See {e.photos.length} {e.photos.length === 1 ? 'photo' : 'photos'}
              </span>
            </span>
          </Link>
        ))}
      </section>

      <Foot />
    </div>
  );
}
