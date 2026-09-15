// Crop geometry. Deliberately imports nothing: src/data/upload.js pulls in
// supabase-js and React through ../lib/auth.js and cannot load under plain
// node, and this is the only part worth testing. Same split as schedule.js.

// The aspect ratios offered in the picker. `null` keeps the photo's own shape.
export const ASPECTS = [
  { label: 'Original', value: null },
  { label: 'Square', value: 1 },
  { label: 'Wide 16:9', value: 16 / 9 },
  { label: 'Portrait 4:5', value: 4 / 5 }
];

// Where to take the crop from, and how big to draw it.
//
//   w, h      the source image
//   aspect    target width/height, or null to keep the original shape
//   pos       0..1 along the axis being cropped: 0 is left/top, 1 is
//             right/bottom, 0.5 centred. A group photo often has its faces
//             above centre, which is the whole reason this is adjustable.
//   maxEdge   the long edge of the result
//
// Never upscales: a small photo stays its own size rather than being blown up
// to maxEdge and ending up looking worse than the original.
export function cropBox(w, h, aspect, pos, maxEdge) {
  if (!(w > 0) || !(h > 0)) throw new Error('bad image size');
  const p = Math.min(1, Math.max(0, Number(pos) || 0));
  let sw = w;
  let sh = h;
  if (aspect > 0) {
    if (w / h > aspect) sw = h * aspect;
    else sh = w / aspect;
  }
  const sx = Math.round((w - sw) * p);
  const sy = Math.round((h - sh) * p);
  sw = Math.round(sw);
  sh = Math.round(sh);
  const edge = Number(maxEdge) > 0 ? Number(maxEdge) : Infinity;
  const scale = Math.min(1, edge / Math.max(sw, sh));
  return {
    sx,
    sy,
    sw,
    sh,
    dw: Math.max(1, Math.round(sw * scale)),
    dh: Math.max(1, Math.round(sh * scale))
  };
}
