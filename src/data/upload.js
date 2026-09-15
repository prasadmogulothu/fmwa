import { sb } from '../lib/auth.js';
import { cropBox } from './crop.js';

export { ASPECTS, cropBox } from './crop.js';

// Preparing an image for upload: work out the crop, shrink it, re-encode it,
// and hand the bytes to /api/upload.
//
// The resize here is for the resident's mobile data, not for safety — a 12 MP
// phone photo should not travel over a colony connection at full size. The
// limit is *enforced* server-side in api/upload.js, which re-checks the byte
// length and sniffs the magic bytes. Neither substitutes for the other; see
// §10a of backblaze-b2.md.

export const DEFAULTS = { max_bytes: 2 * 1024 * 1024, max_edge_px: 1600, quality: 0.82 };

// Duplicated from api/upload.js on purpose — that module imports
// @aws-sdk/client-s3 and must never be reachable from the browser bundle.
// Same deliberate duplication as SITE in api/users.js. Only the admin screen
// reads these, to keep the form from offering a limit the platform will
// reject; api/upload.js holds the copy that actually enforces anything, and
// clamps to it regardless of what is stored. If you change one, change both.
export const VERCEL_CAP = 4500000;
export const HARD_MAX = Math.floor(VERCEL_CAP * 0.72);

export async function loadSettings() {
  const res = await sb.from('fmwa_settings').select('value').eq('key', 'upload').maybeSingle();
  // A missing row or a blocked read must not stop someone uploading — fall
  // back to the same defaults the schema seeds.
  if (res.error || !res.data) return { ...DEFAULTS };
  return { ...DEFAULTS, ...(res.data.value || {}) };
}

export async function saveSettings(value) {
  const res = await sb
    .from('fmwa_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', 'upload')
    .select();
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('Only an administrator can change these.');
}

// EXIF orientation is the trap here: phone photos carry their rotation as a
// tag, and drawing to a canvas throws the tag away, so pictures come out
// sideways. createImageBitmap applies it for us.
export async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari knows createImageBitmap but not the options argument.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be opened as an image.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The browser could not encode the image.'))),
      'image/jpeg',
      quality
    )
  );

// Re-encoding through a canvas also drops every EXIF tag the original carried,
// GPS coordinates included. That is a privacy win worth keeping: do not
// "optimise" this by uploading the original bytes when the image is already
// small enough.
export async function prepare(file, { aspect = null, pos = 0.5, settings = DEFAULTS } = {}) {
  const src = await decode(file);
  const box = cropBox(src.width, src.height, aspect, pos, settings.max_edge_px);
  const canvas = document.createElement('canvas');
  canvas.width = box.dw;
  canvas.height = box.dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, box.sx, box.sy, box.sw, box.sh, 0, 0, box.dw, box.dh);
  if (src.close) src.close();

  // Step the quality down if the first encode is still too big, but a bounded
  // number of times — an unbounded loop on a photo that will never fit would
  // just hang the phone.
  let blob = null;
  let q = Math.min(0.95, Math.max(0.4, Number(settings.quality) || DEFAULTS.quality));
  for (let i = 0; i < 5; i++) {
    blob = await toBlob(canvas, q);
    if (blob.size <= settings.max_bytes) return { blob, width: box.dw, height: box.dh };
    q -= 0.12;
    if (q < 0.4) break;
  }
  throw new Error(
    `This photo is still ${Math.round(blob.size / 1024)} KB after resizing, over the ` +
      `${Math.round(settings.max_bytes / 1024)} KB limit. Try a smaller crop.`
  );
}

const base64 = (blob) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    // readAsDataURL rather than btoa over a Uint8Array: spreading a few
    // hundred thousand bytes into String.fromCharCode overflows the stack.
    fr.onload = () => resolve(String(fr.result).slice(String(fr.result).indexOf(',') + 1));
    fr.onerror = () => reject(new Error('Could not read the image.'));
    fr.readAsDataURL(blob);
  });

// target is 'gallery', `program:${id}` or `day:${id}`.
export async function upload(blob, { eventId, target = 'gallery', year, caption, sort }) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');

  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventId,
      target,
      year,
      caption,
      sort,
      data: await base64(blob)
    })
  });

  // `npm run dev` does not serve /api — the request comes back as the source
  // file with a JS content type, so say that plainly instead of failing on a
  // JSON parse. Same message the Users screen gives.
  const type = r.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new Error('Uploads need `npx vercel dev` (port 3000), not `npm run dev`.');
  }
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'The upload failed.');
  return body;
}
