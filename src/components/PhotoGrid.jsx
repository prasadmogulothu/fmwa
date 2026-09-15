import { useEffect, useRef, useState } from 'react';

// Grid + full-screen viewer. Photos that fail to load drop out of the grid, so
// a filename that hasn't been uploaded yet never leaves a broken tile behind.
//
// A photo is { url, year }. Photos arrive newest year first (sb.js orders
// them), so the grid is split into year sections while the viewer keeps
// stepping through one flat list — arrowing off the end of 2026 lands on the
// first photo of 2025 rather than stopping.
export default function PhotoGrid({ photos, title }) {
  const [gone, setGone] = useState(() => new Set());
  const [at, setAt] = useState(-1);
  const dlg = useRef(null);

  const live = (photos || []).filter((p) => !gone.has(p.url));

  useEffect(() => {
    if (at < 0) dlg.current?.close();
    else if (!dlg.current?.open) dlg.current?.showModal();
  }, [at]);

  const step = (n) => setAt((i) => (i + n + live.length) % live.length);

  if (!live.length) return <p className="noshots">No photos from this one yet.</p>;

  // Walk the list once and cut a new section wherever the year changes,
  // carrying each photo's index in `live` so a tile can open the viewer at the
  // right place. Photos with no year (the bundled ones) form a single
  // unlabelled section, which is how the gallery looked before years existed.
  const sections = [];
  live.forEach((p, i) => {
    const last = sections[sections.length - 1];
    if (last && last.year === p.year) last.items.push({ p, i });
    else sections.push({ year: p.year, items: [{ p, i }] });
  });

  const drop = (url) => setGone((s) => new Set(s).add(url));

  return (
    <>
      {sections.map((sec) => (
        <section key={sec.year ?? 'undated'}>
          {sec.year && <h3 className="shots-year">{sec.year}</h3>}
          <div className="shots">
            {sec.items.map(({ p, i }) => (
              <button
                key={p.url}
                type="button"
                onClick={() => setAt(i)}
                aria-label={`Open photo ${i + 1}`}
              >
                <img src={p.url} alt="" loading="lazy" onError={() => drop(p.url)} />
              </button>
            ))}
          </div>
        </section>
      ))}

      <dialog
        ref={dlg}
        className="viewer"
        onClose={() => setAt(-1)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        {at >= 0 && (
          <>
            <img
              src={live[at].url}
              alt={`${title}${live[at].year ? ` ${live[at].year}` : ''} — photo ${at + 1}`}
            />
            <div className="viewer-bar">
              <button type="button" onClick={() => step(-1)} aria-label="Previous photo">
                ‹
              </button>
              <span>
                {at + 1} / {live.length}
                {live[at].year ? ` · ${live[at].year}` : ''}
              </span>
              <button type="button" onClick={() => step(1)} aria-label="Next photo">
                ›
              </button>
              <button
                type="button"
                className="viewer-x"
                onClick={() => setAt(-1)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
