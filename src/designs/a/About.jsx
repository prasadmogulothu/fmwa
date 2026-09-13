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

export default function About() {
  return (
    <div className="a">
      <Head />

      <section className="a-eh a-eh-solo">
        <div className="a-eh-in">
          <span className="a-when">Since 2018</span>
          <h1>About the Association</h1>
          <p>
            Registered on February 6, 2018 by the plot owners of the colony, and run since then by
            an elected executive committee.
          </p>
        </div>
      </section>

      <section className="a-about">
        <div className="a-about-t">
          <h2>The Association</h2>
          <p>
            Fortune Meadows Welfare Association was registered on February 6, 2018, when the first
            residents elected <b>K. V. Rajasekhar</b> as president and formed an executive committee
            alongside him.
          </p>
          <p>
            The committee handles the everyday running of the colony — water, security, the common
            areas, the park — and puts together the festivals the whole colony turns out for.
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

      <Foot />
    </div>
  );
}
