import { useEffect, useState } from 'react';
import { HARD_MAX, loadSettings, saveSettings } from '../data/upload.js';

// Admin-only. Edits the single fmwa_settings row that decides how big an
// uploaded photo may be and how far the browser shrinks it first.
//
// The gate here is presentational — Admin.jsx already routes non-admins away,
// and the RLS policy on fmwa_settings is what actually refuses the write.

// Shown in MB because nobody thinks in bytes, stored in bytes because that is
// what a byte length compares against.
const MB = 1024 * 1024;
const LIMITS = {
  mb: { min: 0.1, max: Math.floor((HARD_MAX / MB) * 100) / 100 },
  edge: { min: 400, max: 4000 },
  quality: { min: 0.5, max: 0.95 }
};

const between = (n, { min, max }) => Number.isFinite(n) && n >= min && n <= max;

export default function Settings() {
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSettings().then((s) =>
      setForm({
        mb: String(Math.round((s.max_bytes / MB) * 100) / 100),
        edge: String(s.max_edge_px),
        quality: String(s.quality)
      })
    );
  }, []);

  if (!form) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setErr('');
    setNote('');
    const mb = Number(form.mb);
    const edge = Number(form.edge);
    const quality = Number(form.quality);

    // Checked here rather than with `required`/`min`/`max` on the inputs:
    // native validation blocks the submit handler, so these messages would
    // never appear. That was already learned on the password screen.
    if (!between(mb, LIMITS.mb)) {
      return setErr(`Maximum size must be between ${LIMITS.mb.min} and ${LIMITS.mb.max} MB.`);
    }
    if (!between(edge, LIMITS.edge) || !Number.isInteger(edge)) {
      return setErr(
        `Longest edge must be a whole number between ${LIMITS.edge.min} and ${LIMITS.edge.max} px.`
      );
    }
    if (!between(quality, LIMITS.quality)) {
      return setErr(`Quality must be between ${LIMITS.quality.min} and ${LIMITS.quality.max}.`);
    }

    setBusy(true);
    try {
      await saveSettings({
        max_bytes: Math.round(mb * MB),
        max_edge_px: edge,
        quality
      });
      setNote('Saved.');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Upload settings</h2>
      <p className="ad-dim">
        These apply to every photo the committee uploads. The browser shrinks a photo to the longest
        edge below before sending it, so a phone picture does not travel over mobile data at full
        size.
      </p>

      {err && <p className="ad-err">{err}</p>}
      {note && <p className="ad-ok">{note}</p>}

      <form className="ad-grid" onSubmit={save}>
        <label>
          Maximum size (MB)
          <input type="number" step="0.1" value={form.mb} onChange={set('mb')} />
        </label>
        <label>
          Longest edge (px)
          <input type="number" step="10" value={form.edge} onChange={set('edge')} />
        </label>
        <label>
          JPEG quality
          <input type="number" step="0.01" value={form.quality} onChange={set('quality')} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>

      {/* Without this an admin sets 20 MB, uploads start failing at Vercel's
          edge with no error the app can see, and nobody knows why. */}
      <p className="ad-dim">
        The hosting platform rejects anything larger than {LIMITS.mb.max} MB before it reaches the
        site, so that is the ceiling. 1–2 MB is plenty for a colony gallery at {LIMITS.edge.min}–
        {LIMITS.edge.max} px.
      </p>
    </>
  );
}
