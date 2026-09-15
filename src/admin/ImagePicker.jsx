import { useEffect, useRef, useState } from 'react';
import { ASPECTS, DEFAULTS, loadSettings, prepare, upload } from '../data/upload.js';

// Pick a photo, crop it, see what it will weigh, send it.
//
// The crop is an aspect choice plus a position slider rather than a
// drag-and-drop box. A range input is a native control that already works
// with a thumb, a keyboard and a screen reader, which a hand-built drag
// handle would not.
//
// ponytail: no rotate control and no free-form crop rectangle. EXIF rotation
// is applied automatically on decode, which is the only rotation a phone
// photo actually needs. Add a real crop rectangle if the committee starts
// asking for off-centre crops the slider cannot reach.

const kb = (n) => `${Math.round(n / 1024)} KB`;

export default function ImagePicker({ eventId, target = 'gallery', year, label, onDone }) {
  const file = useRef(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [chosen, setChosen] = useState(null);
  const [aspect, setAspect] = useState(null);
  const [pos, setPos] = useState(0.5);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // prepare() is async and re-runs on every slider nudge, so a slow decode
  // from an earlier position must not overwrite a newer preview.
  const gen = useRef(0);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Object URLs are not garbage collected on their own; without this every
  // nudge of the slider leaks a full-size bitmap. This cleanup is the only
  // place that revokes: it runs when `preview` is replaced and again on
  // unmount, which covers every path. Revoking inside a setPreview updater
  // instead would fire twice under StrictMode, because a state updater is
  // meant to be pure.
  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (!chosen) return;
    const mine = ++gen.current;
    setErr('');
    prepare(chosen, { aspect, pos, settings })
      .then(({ blob, width, height }) => {
        // A slow decode from an earlier slider position must not replace a
        // newer preview — and the URL it made would then never be revoked,
        // so drop it here rather than creating one at all.
        if (gen.current !== mine) return;
        setPreview({ url: URL.createObjectURL(blob), blob, width, height });
      })
      .catch((e) => {
        if (gen.current !== mine) return;
        setPreview(null);
        setErr(e.message);
      });
  }, [chosen, aspect, pos, settings]);

  function reset() {
    gen.current++;
    setChosen(null);
    setPreview(null);
    setPos(0.5);
    setAspect(null);
    if (file.current) file.current.value = '';
  }

  async function send() {
    if (!preview) return;
    setBusy(true);
    setErr('');
    try {
      const res = await upload(preview.blob, { eventId, target, year });
      reset();
      onDone?.(res.url);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ad-pick">
      <label className="ad-pick-file">
        {label || 'Add a photo'}
        {/* capture lets a committee member on a phone shoot straight into the
            form. It is a hint, not a restriction: the gallery still opens on
            a laptop. */}
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setChosen(f);
              setPos(0.5);
            }
          }}
        />
      </label>

      {chosen && (
        <>
          <div className="ad-row">
            <label>
              Shape
              <select
                value={ASPECTS.findIndex((a) => a.value === aspect)}
                onChange={(e) => setAspect(ASPECTS[Number(e.target.value)].value)}
              >
                {ASPECTS.map((a, i) => (
                  <option key={a.label} value={i}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            {aspect !== null && (
              <label>
                Position
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={pos}
                  onChange={(e) => setPos(Number(e.target.value))}
                />
              </label>
            )}
          </div>

          {preview && (
            <div className="ad-pick-prev">
              <img src={preview.url} alt="What will be uploaded" />
              {/* Residents upload on mobile data — show the weight before
                  they commit to sending it. */}
              <span className="ad-dim">
                {preview.width}×{preview.height} · {kb(preview.blob.size)} · limit{' '}
                {kb(settings.max_bytes)}
              </span>
            </div>
          )}

          {/* Every one of these needs type="button": a bare <button> inside
              the surrounding form submits it. */}
          <div className="ad-row">
            <button type="button" onClick={send} disabled={busy || !preview}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            <button type="button" className="ad-ghost" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      )}

      {err && <p className="ad-err">{err}</p>}
    </div>
  );
}
