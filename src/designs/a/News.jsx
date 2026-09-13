import { Head, Foot } from './Chrome.jsx';

// ponytail: no posts yet — the association will fill this in. Nothing to
// fetch, so nothing to build beyond the empty state.
export default function News() {
  return (
    <div className="a">
      <Head />

      <section className="a-eh a-eh-solo">
        <div className="a-eh-in">
          <span className="a-when">Noticeboard</span>
          <h1>News</h1>
        </div>
      </section>

      <section className="a-empty">
        <p>Nothing here yet. Association announcements for the colony will appear on this page.</p>
      </section>

      <Foot />
    </div>
  );
}
