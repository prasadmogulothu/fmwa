import { Head, Foot } from './Chrome.jsx';
import { useNews } from '../../data/events.js';

// The noticeboard. Live-only: nothing ships in the bundle, so this shows the
// empty state offline and until Supabase answers. Unpublished posts never
// arrive — the RLS policy on fmwa_news restricts anon to published rows.

const nice = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  // Built from the parts rather than new Date(d): parsing 'YYYY-MM-DD' gives
  // UTC midnight, which reads as the previous day anywhere east of Greenwich.
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

export default function News() {
  const { news, ready } = useNews();

  return (
    <div className="a">
      <Head />

      <section className="a-eh a-eh-solo">
        <div className="a-eh-in">
          <span className="a-when">Noticeboard</span>
          <h1>News</h1>
        </div>
      </section>

      {/* Render nothing rather than "nothing here yet" while the first fetch
          is still in flight, so the page never flashes an empty state at
          someone whose announcements are about to arrive. */}
      {!ready ? null : news.length ? (
        <section className="a-news">
          {news.map((n) => (
            <article key={n.id}>
              <time dateTime={n.date}>{nice(n.date)}</time>
              <h2>{n.title}</h2>
              {/* Line breaks the writer typed are kept by white-space in CSS;
                  the text is rendered as text, never as markup. */}
              {n.body && <p>{n.body}</p>}
            </article>
          ))}
        </section>
      ) : (
        <section className="a-empty">
          <p>
            Nothing here yet. Association announcements for the colony will appear on this page.
          </p>
        </section>
      )}

      <Foot />
    </div>
  );
}
