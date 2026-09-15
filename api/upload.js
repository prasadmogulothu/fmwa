// Gallery and timetable image uploads. The only code that holds the B2
// application key, and the only reason it exists: B2 credentials cannot reach
// the browser, and a size limit cannot be enforced by a presigned PUT.
//
// Deliberately does NOT hold the Supabase service-role key. Every database
// read and write below runs as the *caller*, against PostgREST with their own
// JWT, so the RLS policies in supabase-gallery.sql are what authorise the
// upload. That is the rule in §3.2 of backblaze-b2.md — the database enforces
// access independently — applied literally: there is no code path here that
// decides permission from a role the client sent.
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const B2 = {
  id: process.env.B2_KEY_ID,
  key: process.env.B2_APP_KEY,
  bucket: process.env.B2_BUCKET,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  base: process.env.B2_PUBLIC_BASE
};

// Same domain pin as api/users.js, and for the same reason: this Supabase
// project is shared with other HHAppSolutions sites. The leading '@' is
// load-bearing — without it 'evil@notfortunemeadows.local' passes endsWith().
export const SITE = '@fortunemeadows.local';
export const ROLES = ['fmwa_admin', 'fmwa_committee'];

// Vercel rejects a request body over ~4.5 MB at the platform edge, with an
// opaque error the app never sees. An admin who sets max_bytes to 20 MB would
// otherwise produce uploads that fail for no visible reason, so the setting is
// clamped here rather than trusted. See §12 of backblaze-b2.md.
export const VERCEL_CAP = 4500000;
// Base64 costs 4 bytes for every 3, so the decoded image is always smaller
// than the body that carried it. This is the ceiling on the image itself.
export const HARD_MAX = Math.floor(VERCEL_CAP * 0.72);
export const DEFAULT_MAX = 2 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The declared MIME type and the filename are both attacker-controlled, and
// neither is consulted anywhere in this file. The first bytes of the image are
// the only thing that decides what it is, and the extension is derived from
// that — so a stored object's extension can never disagree with its content.
export function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buf.subarray(0, 8).equals(PNG)) return { ext: 'png', mime: 'image/png' };
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

export const EXTS = ['jpg', 'png', 'webp'];

// The path-traversal lesson from §5, applied to object keys. Nothing the
// client sent reaches the key: the event id must be a positive integer, the
// extension must be one sniff() recognised from the magic bytes, and the
// filename is a fresh UUID. A key like '../other-tenant/x.jpg' is not
// rejected by a filter here — it is unreachable by construction.
export function keyFor(eventId, ext) {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error('bad event id');
  if (!EXTS.includes(ext)) throw new Error('bad extension');
  return `events/${eventId}/${randomUUID()}.${ext}`;
}

// Rejects NaN, Infinity, strings and negatives as well as oversize: a size
// that is not a number is not "unlimited".
export const tooBig = (size, max) =>
  !Number.isFinite(size) || size <= 0 || !Number.isFinite(max) || size > max;

export const clampMax = (n) =>
  Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), HARD_MAX) : DEFAULT_MAX;

export const ours = (email) =>
  String(email || '')
    .toLowerCase()
    .endsWith(SITE);

export const idOf = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

// Every PostgREST call runs as the caller. PostgREST verifies the JWT
// signature and switches into fmwa_admin or fmwa_committee before touching a
// row, so RLS — not this file — decides what the request may see or write.
const rest = (token, path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

async function caller(token) {
  if (!token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }
  });
  return r.ok ? r.json() : null;
}

const s3 = () =>
  new S3Client({
    region: B2.region,
    endpoint: `https://${B2.endpoint}`,
    credentials: { accessKeyId: B2.id, secretAccessKey: B2.key }
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!SB_URL || !SB_ANON || Object.values(B2).some((v) => !v)) {
    return res.status(500).json({ error: 'Server is not configured.' });
  }

  const token = bearer(req);
  const me = await caller(token);
  if (!me) return res.status(401).json({ error: 'Sign in first.' });
  // Role and tenant together, so "this function only ever touches
  // fortunemeadows.local" holds for the caller as well as for every target.
  // A cheap early reject, not the authorisation — that is RLS, below.
  if (!ROLES.includes(me.role) || !ours(me.email)) {
    return res.status(403).json({ error: 'Committee members only.' });
  }

  const { eventId, target, data, year, caption, sort } = req.body || {};
  const event = idOf(eventId);
  if (!event) return res.status(400).json({ error: 'Missing event.' });

  // --- authorise, by asking the database -----------------------------------
  // Read the assignment back as the caller. For a committee user the RLS
  // policy on fmwa_event_editors returns their own rows and nothing else, so
  // an empty result is a real "not yours". Admins skip it because their policy
  // is using (true) and they may touch any event. This runs BEFORE the B2 PUT
  // so a refused request never leaves an orphan object in the bucket.
  if (me.role === 'fmwa_committee') {
    const r = await rest(token, `fmwa_event_editors?select=event_id&event_id=eq.${event}`);
    if (!r.ok) return res.status(502).json({ error: 'Could not check your events.' });
    const rows = await r.json();
    if (!rows.length) return res.status(403).json({ error: 'That event is not yours to edit.' });
  }

  // --- validate the bytes --------------------------------------------------
  if (typeof data !== 'string' || !data) return res.status(400).json({ error: 'No image.' });
  const buf = Buffer.from(data, 'base64');
  const kind = sniff(buf);
  if (!kind) return res.status(400).json({ error: 'That file is not a JPEG, PNG or WebP.' });

  // The limit the admin set, read as the caller, clamped to what the platform
  // will actually carry. The browser resizes to this too, but that is for the
  // resident's mobile data — this is the enforcement. See §10a.
  let max = DEFAULT_MAX;
  const s = await rest(token, 'fmwa_settings?select=value&key=eq.upload');
  if (s.ok) {
    const [row] = await s.json();
    max = clampMax(row?.value?.max_bytes);
  }
  if (tooBig(buf.length, max)) {
    const kb = (n) => Math.round(n / 1024);
    return res
      .status(413)
      .json({ error: `That image is ${kb(buf.length)} KB and the limit is ${kb(max)} KB.` });
  }

  // --- store it ------------------------------------------------------------
  const key = keyFor(event, kind.ext);
  const client = s3();
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: B2.bucket,
        Key: key,
        Body: buf,
        ContentType: kind.mime,
        // The key carries a UUID, so an object at a given key never changes.
        CacheControl: 'public, max-age=31536000, immutable'
      })
    );
  } catch {
    return res.status(502).json({ error: 'Could not store the image.' });
  }
  const url = `${B2.base.replace(/\/+$/, '')}/${key}`;

  // --- record it -----------------------------------------------------------
  // Written as the caller again, so RLS is the authority a second time: a
  // committee user patching a programme row they do not own gets zero rows
  // back here even if the check above were somehow wrong.
  const wrote = await record(token, { target, event, url, year, caption, sort });
  if (!wrote.ok) {
    // The row is what makes the object reachable; without it the object is
    // invisible litter. Remove it rather than let the bucket fill up.
    try {
      await client.send(new DeleteObjectCommand({ Bucket: B2.bucket, Key: key }));
    } catch {
      console.error('orphaned B2 object', key);
    }
    return res.status(wrote.status).json({ error: wrote.error });
  }
  return res.status(201).json({ url, key });
}

// target is 'gallery', 'program:<id>' or 'day:<id>'. The id is parsed and
// range-checked before it reaches a PostgREST filter, which is the same class
// of sink as the URL template that was exploitable in api/users.js (§5).
async function record(token, { target, event, url, year, caption, sort }) {
  const t = String(target || 'gallery');

  if (t === 'gallery') {
    const body = { event_id: event, url, caption: caption ? String(caption).slice(0, 300) : null };
    const y = idOf(year);
    if (y) body.year = y;
    const n = Number(sort);
    if (Number.isSafeInteger(n)) body.sort = n;
    const r = await rest(token, 'fmwa_photos', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) {
      return {
        ok: false,
        status: r.status === 403 ? 403 : 502,
        error: 'Could not save the photo.'
      };
    }
    return { ok: true };
  }

  const [kind, rawId] = t.split(':');
  const table = kind === 'program' ? 'fmwa_programs' : kind === 'day' ? 'fmwa_event_days' : null;
  const id = idOf(rawId);
  if (!table || !id) return { ok: false, status: 400, error: 'Unknown target.' };

  // return=representation so an RLS refusal comes back as an empty array
  // rather than a silent 204 that looks like success.
  const r = await rest(token, `${table}?id=eq.${id}&select=id`, {
    method: 'PATCH',
    body: JSON.stringify({ image_url: url }),
    headers: { Prefer: 'return=representation' }
  });
  if (!r.ok) return { ok: false, status: 502, error: 'Could not attach the image.' };
  const rows = await r.json();
  if (!rows.length) return { ok: false, status: 403, error: 'That row is not yours to edit.' };
  return { ok: true };
}
