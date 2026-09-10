import { useEffect, useRef, useState } from 'react';

// Grid + full-screen viewer. Photos that fail to load drop out of the grid, so
// a filename that hasn't been uploaded yet never leaves a broken tile behind.
export default function PhotoGrid({ photos, title }) {
  const [gone, setGone] = useState(() => new Set());
  const [at, setAt] = useState(-1);
  const dlg = useRef(null);

  const live = photos.filter((p) => !gone.has(p));

  useEffect(() => {
    if (at < 0) dlg.current?.close();
    else if (!dlg.current?.open) dlg.current?.showModal();
  }, [at]);

  const step = (n) => setAt((i) => (i + n + live.length) % live.length);

  if (!live.length) return <p className="noshots">No photos from this one yet.</p>;

  return (
    <>
      <div className="shots">
        {live.map((p, i) => (
          <button key={p} type="button" onClick={() => setAt(i)} aria-label={`Open photo ${i + 1}`}>
            <img src={p} alt="" loading="lazy" onError={() => setGone((s) => new Set(s).add(p))} />
          </button>
        ))}
      </div>

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
            <img src={live[at]} alt={`${title} — photo ${at + 1}`} />
            <div className="viewer-bar">
              <button type="button" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
              <span>{at + 1} / {live.length}</span>
              <button type="button" onClick={() => step(1)} aria-label="Next photo">›</button>
              <button type="button" className="viewer-x" onClick={() => setAt(-1)} aria-label="Close">Close</button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
