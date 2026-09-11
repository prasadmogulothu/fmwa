import { Link } from 'react-router-dom';
import { useEvents } from '../../data/events.js';
import { BODIES } from '../../data/committee.js';
import { Head, Foot } from './Chrome.jsx';

function ElectedBody({ year, note, office, members }) {
  return (
    <div className="a-term">
      <div className="a-body-h">
        <h2>{year} Elected Body</h2>
        {note && <p>{note}</p>}
      </div>
      <dl className="a-office">
        {office.map(([role, name]) => (
          <div key={role}>
            <dt>{role}</dt>
            <dd>{name}</dd>
          </div>
        ))}
      </dl>
      <div className="a-exec">
        <h3>Executive members</h3>
        <ul>
          {members.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Home() {
  const { events } = useEvents();

  return (
    <div className="a">
      <Head home />

      <section className="a-hero">
        <img src="/assets/banner.png" alt="The main gate of Fortune Meadows" />
        <div className="a-hero-in">
          <h1>
            Fortune Meadows
            <em>Welfare Association</em>
          </h1>
          <p className="a-hero-p">
            Formed in 2018 by the plot owners of the colony, and run since then by an elected
            committee.
          </p>
        </div>

        <ul className="a-index">
          {events.map((e) => (
            <li key={e.slug} style={{ '--ac': e.accent }}>
              <Link to={`/event/${e.slug}`}>
                <img src={e.thumb} alt="" loading="lazy" />
                <span>
                  <b>{e.title}</b>
                  <i>{e.when}</i>
                </span>
                <em>
                  {e.photos.length} {e.photos.length === 1 ? 'photo' : 'photos'}
                </em>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="a-about">
        <div className="a-about-t">
          <h2>About the Association</h2>
          <p>
            Fortune Meadows Welfare Association was registered on February 6, 2018, when the first residents
            elected <b>K. V. Rajasekhar</b> as president and formed an executive committee alongside him.
          </p>
          <p>
            The committee handles the everyday running of the colony — water, security, the
            common areas, the park — and puts together the three festivals the whole colony
            turns out for.
          </p>
        </div>
        <dl className="a-plate">
          <div>
            <dt>Formed</dt>
            <dd>2018</dd>
          </div>
          <div>
            <dt>Founding president</dt>
            <dd>K. V. Rajasekhar</dd>
          </div>
          <div>
            <dt>Run by</dt>
            <dd>Elected executive committee</dd>
          </div>
        </dl>
      </section>


      <section className="a-body">
        {BODIES.map((b) => (
          <ElectedBody key={b.year} {...b} />
        ))}
      </section>

      <section className="a-fest" id="festivals">
        <div className="a-fest-h">
          <h2>2026 - Events</h2>
          <p>Three occasions the colony keeps, every year, at the gate and in the open plot.</p>
        </div>

        <div className="a-cards">
          {events.map((e) => (
            <Link
              className="a-card"
              id={e.slug}
              key={e.slug}
              to={`/event/${e.slug}`}
              style={{ '--ac': e.accent }}
            >
              <span className="a-card-img">
                <img src={e.thumb} alt="" loading="lazy" />
              </span>
              <span className="a-card-b">
                <span className="a-when">{e.when}</span>
                <h3>{e.title}</h3>
                <span className="a-te">{e.telugu}</span>
                <span className="a-line">{e.line}</span>
                <span className="a-count">
                  {e.photos.length} {e.photos.length === 1 ? 'photo' : 'photos'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Foot />
    </div>
  );
}
