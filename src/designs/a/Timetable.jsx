import { Fragment } from 'react';
import { clock, dayLabel } from '../../data/schedule.js';

// Renders nothing at all when there is no published schedule, which is also
// what happens offline and before Supabase answers.
export default function Timetable({ days, title }) {
  if (!days || !days.length) return null;

  return (
    <section className="a-tt">
      <div className="a-tt-in">
        <div className="a-tt-h">
          <h2>{title}</h2>
          <p>Timings as scheduled by the festival committee.</p>
        </div>
        <div className="a-tt-scroll">
          <table className="a-tt-t">
            <tbody>
              {days.map((d) => (
                <Fragment key={d.date}>
                  <tr className="a-tt-day">
                    <th colSpan={2} scope="colgroup">
                      <span>{dayLabel(d.date)}</span>
                      {d.label && <i>{d.label}</i>}
                    </th>
                  </tr>
                  {d.programs.length === 0 && (
                    <tr>
                      <td className="a-tt-when" />
                      <td className="a-tt-what">
                        <i>Programme to be announced.</i>
                      </td>
                    </tr>
                  )}
                  {d.programs.map((p, i) => (
                    <tr key={`${d.date}-${i}`}>
                      <td className="a-tt-when">{clock(p.start)}</td>
                      <td className="a-tt-what">
                        <b>{p.title}</b>
                        {p.note && <i>{p.note}</i>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
