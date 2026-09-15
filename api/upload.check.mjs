// node api/upload.check.mjs
//
// Covers the pure logic in api/upload.js — the parts that decide what an
// object key looks like, what counts as an image, and what counts as too big.
// Everything else in that file is authorisation, which is RLS and can only be
// tested against a real database (see §14 of backblaze-b2.md).
//
// Imports the real constants rather than re-declaring them, so this pins the
// rule the handler applies and not a copy that can drift away from it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_MAX,
  EXTS,
  HARD_MAX,
  SITE,
  VERCEL_CAP,
  clampMax,
  idOf,
  keyFor,
  ours,
  sniff,
  tooBig
} from './upload.js';

// ---------------------------------------------------------------- keyFor
// The key is built, never accepted. A filename cannot reach it at all, so
// these assert that the one client-supplied part — the event id — cannot
// carry a path out of the events/<id>/ prefix.
for (const bad of [
  '../../etc/passwd',
  '../other-tenant',
  '/absolute',
  '1/../2',
  '1; drop table',
  1.5,
  -1,
  0,
  NaN,
  Infinity,
  null,
  undefined,
  '3',
  Number.MAX_SAFE_INTEGER + 1
]) {
  assert.throws(() => keyFor(bad, 'jpg'), /bad event id/, `event id accepted: ${String(bad)}`);
}

// An extension sniff() never returns must not reach the key either.
for (const bad of ['exe', 'svg', 'php', 'jpg/../x', '', null, 'JPG']) {
  assert.throws(() => keyFor(7, bad), /bad extension/, `extension accepted: ${String(bad)}`);
}

for (const ext of EXTS) {
  const key = keyFor(7, ext);
  assert.match(key, /^events\/7\/[0-9a-f-]{36}\.(jpg|png|webp)$/, key);
  assert.ok(!key.includes('..'), key);
}
// Two uploads to the same event never collide.
assert.notEqual(keyFor(7, 'jpg'), keyFor(7, 'jpg'));

// ----------------------------------------------------------------- sniff
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16)
]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(16)
]);

assert.deepEqual(sniff(jpeg), { ext: 'jpg', mime: 'image/jpeg' });
assert.deepEqual(sniff(png), { ext: 'png', mime: 'image/png' });
assert.deepEqual(sniff(webp), { ext: 'webp', mime: 'image/webp' });

// Things that are not images, including ones that would pass an extension or
// Content-Type check. The SVG matters: it is an image to a browser and can
// carry script, and nothing here should ever accept it.
const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const html = Buffer.from('<!doctype html><html><body>hello there</body></html>');
const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);
const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(16)]);
for (const bad of [gif, svg, html, zip, elf, Buffer.alloc(32), Buffer.alloc(0)]) {
  assert.equal(sniff(bad), null);
}
// A RIFF container that is not WebP (a .wav, say) must not pass as one.
assert.equal(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(16)])), null);
// Too short to sniff, even though the first bytes are right.
assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff])), null);
// Not a Buffer at all.
for (const bad of [null, undefined, 'ffd8ff', 42, {}, []]) assert.equal(sniff(bad), null);

// ---------------------------------------------------------------- tooBig
assert.equal(tooBig(100, 200), false);
assert.equal(tooBig(200, 200), false, 'exactly at the limit is allowed');
assert.equal(tooBig(201, 200), true);
// A size or a limit that is not a number is not "unlimited".
for (const bad of [NaN, Infinity, -1, 0, '100', null, undefined]) {
  assert.equal(tooBig(bad, 200), true, `size accepted: ${String(bad)}`);
}
for (const bad of [NaN, Infinity, '200', null, undefined]) {
  assert.equal(tooBig(100, bad), true, `limit accepted: ${String(bad)}`);
}

// -------------------------------------------------------------- clampMax
// An admin who types 20 MB gets the platform ceiling, not an upload that dies
// at Vercel's edge with an error the app never sees.
assert.equal(clampMax(20 * 1024 * 1024), HARD_MAX);
assert.equal(clampMax(HARD_MAX + 1), HARD_MAX);
assert.equal(clampMax(1024 * 1024), 1024 * 1024);
assert.equal(clampMax(1500.7), 1500, 'fractional limits floor rather than throw');
// Missing or nonsense settings fall back to the default, never to unlimited.
for (const bad of [undefined, null, 0, -5, NaN, Infinity, '1048576', {}]) {
  assert.equal(clampMax(bad), DEFAULT_MAX, `limit accepted: ${String(bad)}`);
}
assert.ok(HARD_MAX < 4500000, 'base64 overhead must keep the image under the body cap');

// ------------------------------------------------------------------ ours
// The leading '@' is the whole point: without it the second case passes.
assert.equal(ours('admin@fortunemeadows.local'), true);
assert.equal(ours('ADMIN@FortuneMeadows.Local'), true);
assert.equal(ours('evil@notfortunemeadows.local'), false);
assert.equal(ours('admin@muralielectronics.local'), false);
assert.equal(ours('admin@fortunemeadows.local.evil.com'), false);
for (const bad of ['', null, undefined, 0, {}]) assert.equal(ours(bad), false);
assert.equal(SITE[0], '@', 'SITE must keep its leading @');

// ------------------------------------------------------------------ idOf
assert.equal(idOf(7), 7);
assert.equal(idOf('7'), 7);
for (const bad of ['../1', '1 or 1=1', '1e3x', 0, -1, 1.5, NaN, '', null, undefined, {}]) {
  assert.equal(idOf(bad), null, `id accepted: ${String(bad)}`);
}

// ------------------------------------------------- the mirrored constants
// src/data/upload.js carries its own copy of VERCEL_CAP and HARD_MAX, because
// this module imports @aws-sdk/client-s3 and must never be reachable from the
// browser bundle. It cannot be imported here either (it pulls in React and
// supabase-js through ../lib/auth.js), so the copies are compared as text.
// Only the admin form reads the client copy — this file clamps regardless —
// but a drifted copy offers admins a limit that silently gets clamped, which
// is exactly the baffling behaviour the clamp exists to prevent.
const client = readFileSync(new URL('../src/data/upload.js', import.meta.url), 'utf8');
const num = (name) => {
  const m = client.match(new RegExp(`export const ${name} = ([0-9.]+)`));
  assert.ok(m, `${name} is missing from src/data/upload.js`);
  return Number(m[1]);
};
assert.equal(num('VERCEL_CAP'), VERCEL_CAP, 'VERCEL_CAP drifted from src/data/upload.js');
assert.match(
  client,
  /export const HARD_MAX = Math\.floor\(VERCEL_CAP \* 0\.72\)/,
  'HARD_MAX drifted from src/data/upload.js'
);

console.log('upload.check.mjs ok');
