import { Link } from 'react-router-dom';
import { useEvents, useNews, useTimetable } from '../../data/events.js';
import { currentEvent, today } from '../../data/schedule.js';
import { FEST } from '../../data/committee.js';
import { Head, Foot } from './Chrome.jsx';
import Timetable from './Timetable.jsx';

// The committee note is stored as plain text with *starred* runs, the way it
// was written in WhatsApp. Odd split pieces are the ones inside a * pair.
// Built from the parts rather than new Date(d): parsing 'YYYY-MM-DD' gives
// UTC midnight, which reads as the previous day anywhere east of Greenwich.
const niceDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

// The association's facts. Rendered in the left column above "View details"
// when there is an announcement — the right column is the announcement's —
// and in the right column under it when there is not.
const Plate = () => (
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
);

const Rich = ({ t }) => (
  <>{t.split('*').map((piece, i) => (i % 2 ? <b key={i}>{piece}</b> : piece))}</>
);

// Roughly how much of an announcement fits in the sidebar column before it
// stops being a summary. Compared against the text rather than measured: the
// CSS clamp below is what actually cuts it off, and a character count is
// enough to decide whether anything was cut. Getting it slightly wrong shows
// the link on a post that happened to fit, which is harmless.
const SUMMARY = 320;

export default function Home() {
  const { events } = useEvents();
  const { timetable } = useTimetable();
  // Already sorted newest first by the query, so the latest is simply the
  // first. Empty until Supabase answers, and empty offline.
  const { news } = useNews();
  const latest = news[0] || null;
  const dated = events.map((e) => ({ ...e, days: timetable.get(e.slug) || [] }));
  const now = currentEvent(dated, today());

  return (
    <div className="a">
      <Head />

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
            Fortune Meadows Welfare Association was registered on February 6, 2018, when the first
            residents elected <b>K. V. Rajasekhar</b> as president and formed an executive committee
            alongside him.
          </p>
          <p>
            The committee handles the everyday running of the colony — water, security, the common
            areas, the park — and puts together the festivals the whole colony turns out for.
          </p>
          {latest && <Plate />}
          <Link className="a-more" to="/aboutus">
            View details
          </Link>
        </div>
        <div className="a-about-r">
          {/* Hidden unless the programme table below is actually rendered —
              a button that scrolls nowhere is worse than no button. */}
          {now?.days.length > 0 && (
            <button
              className="a-present"
              type="button"
              onClick={() =>
                document.querySelector('.a-tt')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Present Event Details
            </button>
          )}
          {/* Only when there is something to show: with no announcements the
              right column falls back to exactly what it was before. */}
          {latest && (
            <section className="a-ln">
              <h2>Latest News</h2>
              <time dateTime={latest.date}>{niceDate(latest.date)}</time>
              <h3>{latest.title}</h3>
              {latest.body && (
                <p className={latest.body.length > SUMMARY ? 'a-ln-body a-ln-cut' : 'a-ln-body'}>
                  {latest.body}
                </p>
              )}
              {/* Only offered when the text was actually cut short — a "read
                  more" on a post shown in full is a dead end. */}
              {latest.body.length > SUMMARY && (
                <Link className="a-more" to="/news">
                  View full news
                </Link>
              )}
            </section>
          )}
          {!latest && <Plate />}
        </div>
      </section>

      {now && <Timetable days={now.days} title={`${now.title} — Programme`} />}

      <section className="a-fc">
        <div className="a-fc-in">
          <div className="a-fc-h">
            <h2>Fortune Meadows Festival Committee</h2>
            {FEST.intro.map((t) => (
              <p key={t}>
                <Rich t={t} />
              </p>
            ))}
          </div>

          <div className="a-fc-cols">
            <div className="a-fc-col">
              {FEST.left.map((t) => (
                <p key={t}>
                  <Rich t={t} />
                </p>
              ))}
              <ol className="a-fc-mem">
                {FEST.members.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ol>
              <p>
                <Rich t={FEST.leftEnd} />
              </p>
            </div>

            <div className="a-fc-col">
              <h3>
                <Rich t={FEST.rightHead} />
              </h3>
              {FEST.right.map((t) => (
                <p key={t}>
                  <Rich t={t} />
                </p>
              ))}
              <ul className="a-fc-ph">
                {FEST.phones.map(([who, num]) => (
                  <li key={num}>
                    <span>📞 {who}</span>
                    <a href={`tel:${num}`}>{num}</a>
                  </li>
                ))}
              </ul>
              {FEST.rest.map((t) => (
                <p key={t}>
                  <Rich t={t} />
                </p>
              ))}
              <p className="a-fc-sign">
                {FEST.sign.map((t) => (
                  <span key={t}>
                    <Rich t={t} />
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="a-fest" id="festivals">
        <div className="a-fest-h">
          <h2>2026 - Events</h2>
          <p>Celebrated every year at the gate, in the open plot and at the colony pandal.</p>
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
