// node src/data/upload.check.mjs
//
// cropBox is the only non-trivial logic in src/data/upload.js — the rest is
// canvas and network calls that need a browser. Imported from the real module
// so this pins the maths the picker actually uses.
//
import assert from 'node:assert/strict';
import { ASPECTS, cropBox } from './crop.js';

const box = (w, h, a, p, e) => cropBox(w, h, a, p, e);

// ------------------------------------------------- no crop, no upscale
// A landscape photo, long edge capped.
assert.deepEqual(box(4000, 3000, null, 0.5, 1600), {
  sx: 0,
  sy: 0,
  sw: 4000,
  sh: 3000,
  dw: 1600,
  dh: 1200
});
// Smaller than the cap: left alone, never blown up.
assert.deepEqual(box(800, 600, null, 0.5, 1600), {
  sx: 0,
  sy: 0,
  sw: 800,
  sh: 600,
  dw: 800,
  dh: 600
});
// Portrait: the cap applies to the long edge, which is the height.
const p = box(3000, 4000, null, 0.5, 1600);
assert.equal(Math.max(p.dw, p.dh), 1600);
assert.equal(p.dw, 1200);

// ------------------------------------------------------------- square
// A 4000x3000 squared is a 3000x3000 window, centred: 500px trimmed each side.
assert.deepEqual(box(4000, 3000, 1, 0.5, 1600), {
  sx: 500,
  sy: 0,
  sw: 3000,
  sh: 3000,
  dw: 1600,
  dh: 1600
});
// pos drives which part survives.
assert.equal(box(4000, 3000, 1, 0, 1600).sx, 0, 'pos 0 takes the left edge');
assert.equal(box(4000, 3000, 1, 1, 1600).sx, 1000, 'pos 1 takes the right edge');

// A portrait squared crops the height instead, and pos moves it up or down —
// the case that stops a group photo losing its heads.
assert.deepEqual(box(3000, 4000, 1, 0, 1600), {
  sx: 0,
  sy: 0,
  sw: 3000,
  sh: 3000,
  dw: 1600,
  dh: 1600
});
assert.equal(box(3000, 4000, 1, 1, 1600).sy, 1000);
assert.equal(box(3000, 4000, 1, 0.5, 1600).sy, 500);

// An already-square photo is untouched by a square crop.
assert.deepEqual(box(2000, 2000, 1, 0.5, 1600), {
  sx: 0,
  sy: 0,
  sw: 2000,
  sh: 2000,
  dw: 1600,
  dh: 1600
});

// ------------------------------------------------------ other aspects
const wide = box(4000, 3000, 16 / 9, 0.5, 1600);
assert.ok(Math.abs(wide.dw / wide.dh - 16 / 9) < 0.01, `16:9 got ${wide.dw}x${wide.dh}`);
assert.equal(wide.sw, 4000, 'a 4:3 photo cropped to 16:9 loses height, not width');
assert.ok(wide.sh < 3000);

const tall = box(4000, 3000, 4 / 5, 0.5, 1600);
assert.ok(Math.abs(tall.dw / tall.dh - 4 / 5) < 0.01, `4:5 got ${tall.dw}x${tall.dh}`);
assert.ok(tall.sw < 4000, 'a landscape photo cropped to 4:5 loses width');
assert.equal(tall.sh, 3000);

// The crop window always stays inside the source image.
for (const [w, h] of [[4000, 3000], [3000, 4000], [2000, 2000], [1, 5000]]) {
  for (const a of [null, 1, 16 / 9, 4 / 5]) {
    for (const pos of [0, 0.25, 0.5, 1]) {
      const b = box(w, h, a, pos, 1600);
      assert.ok(b.sx >= 0 && b.sy >= 0, `negative origin ${w}x${h} a=${a} pos=${pos}`);
      assert.ok(b.sx + b.sw <= w + 1, `overruns width ${w}x${h} a=${a} pos=${pos}`);
      assert.ok(b.sy + b.sh <= h + 1, `overruns height ${w}x${h} a=${a} pos=${pos}`);
      assert.ok(b.dw >= 1 && b.dh >= 1, 'canvas must never be zero-sized');
      assert.ok(Math.max(b.dw, b.dh) <= 1600, 'long edge must respect the cap');
    }
  }
}

// ------------------------------------------------------------- guards
// A pos outside 0..1 clamps rather than producing an off-image crop.
assert.equal(box(4000, 3000, 1, -5, 1600).sx, 0);
assert.equal(box(4000, 3000, 1, 99, 1600).sx, 1000);
for (const bad of [NaN, null, undefined, 'x', {}]) {
  assert.equal(box(4000, 3000, 1, bad, 1600).sx, 0, `pos accepted: ${String(bad)}`);
}
// A missing or nonsense edge cap means "do not scale", not "scale to zero".
for (const bad of [0, -1, NaN, null, undefined]) {
  const b = box(800, 600, null, 0.5, bad);
  assert.deepEqual([b.dw, b.dh], [800, 600], `edge accepted: ${String(bad)}`);
}
// An image with no dimensions is a decode failure, not a crop.
for (const [w, h] of [[0, 100], [100, 0], [-1, 5], [NaN, 10]]) {
  assert.throws(() => box(w, h, 1, 0.5, 1600), /bad image size/, `size accepted: ${w}x${h}`);
}

// ----------------------------------------------------------- ASPECTS
// Every offered ratio must be one cropBox actually honours, and exactly one
// of them must be the no-crop option.
assert.equal(ASPECTS.filter((a) => a.value === null).length, 1);
for (const { label, value } of ASPECTS) {
  assert.ok(label, 'every aspect needs a label for the picker');
  if (value === null) continue;
  assert.ok(value > 0, `${label} is not a usable ratio`);
  const b = box(4000, 3000, value, 0.5, 1600);
  assert.ok(Math.abs(b.dw / b.dh - value) < 0.02, `${label} produced ${b.dw}x${b.dh}`);
}

console.log('src/data/upload.check.mjs ok');
