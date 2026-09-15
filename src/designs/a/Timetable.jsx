import { Fragment } from 'react';
import { clock, dayLabel } from '../../data/schedule.js';

// The first image anywhere in the timetable, scanning day by day and, within a
// day, the day's own image before its programmes'. It gets pulled out and
// shown beside the list instead of inline, so the section leads with a picture
// rather than burying it in a table row.
function firstImage(days) {
  for (const d of days) {
    if (d.image) return { url: d.image, label: d.label || dayLabel(d.date) };
    for (const p of d.programs) {
      if (p.image) return { url: p.image, label: p.title };
    }
  }
  return null;
}

// Renders nothing at all when there is no published schedule, which is also
// what happens offline and before Supabase answers.
export default function Timetable({ days, title }) {
  if (!days || !days.length) return null;

  const lead = firstImage(days);

  return (
    <section className="a-tt">
      <div className="a-tt-in">
        <div className="a-tt-h">
          <h2>{title}</h2>
          <p>Timings as scheduled by the festival committee.</p>
        </div>

        {/* Two columns only when there is actually a photo to show, so a
            timetable without one keeps the full width instead of leaving an
            empty gutter. */}
        <div className={lead ? 'a-tt-body a-tt-body-split' : 'a-tt-body'}>
          <div className="a-tt-scroll">
            <table className="a-tt-t">
              <tbody>
                {days.map((d) => (
                  <Fragment key={d.date}>
                    <tr className="a-tt-day">
                      <th colSpan={2} scope="colgroup">
                        <span>{dayLabel(d.date)}</span>
                        {d.label && <i>{d.label}</i>}
                        {/* The lead photo is shown beside the list, so skip it
                            here — the same picture twice in one section reads
                            as a bug. alt="" on the rest: the programme title
                            sits right beside the picture, and announcing it
                            twice only adds noise for a screen reader. */}
                        {d.image && d.image !== lead?.url && (
                          <img className="a-tt-img" src={d.image} alt="" loading="lazy" />
                        )}
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
                          {p.image && p.image !== lead?.url && (
                            <img className="a-tt-img" src={p.image} alt="" loading="lazy" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {lead && (
            <figure className="a-tt-lead">
              {/* Real alt text here, unlike the inline images: pulled out of
                  the list, this picture has lost the row that described it. */}
              <img src={lead.url} alt={lead.label} loading="lazy" />
            </figure>
          )}
        </div>
      </div>
    </section>
  );
}
