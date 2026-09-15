# Piece D — Event gallery uploads on Backblaze B2

Handover document. Written 2026-09-15, at the end of the session that built
pieces A–C (committee roles, event timetables, the public timetable). Pieces
A–C are merged to `main` and deployed.

This file is meant to be read cold, by a session with no memory of that work.
Read it end to end before writing code — the "Existing patterns" and "Traps
already hit" sections will save you from repeating mistakes that cost real
review rounds.

---

## 1. What piece D adds

Three things the user asked for, on top of a working B2 upload path:

1. **Admin-defined upload limits.** The admin can set the maximum size (and
   pixel dimensions) of an image uploaded to an event gallery. Not a constant
   in the source — something the admin changes from the admin UI.
2. **One image per programme row.** Each entry in an event's day-by-day
   timetable can carry exactly one image — not a gallery, one. The same applies
   at event level where the user asked for "any event/programme".
3. **Crop and auto-resize on upload.** When someone picks a large file, the
   browser resizes (and optionally crops) it before anything is uploaded, so a
   12 MP phone photo does not travel over a colony's mobile connection at full
   size.

Everything else — the existing `fmwa_photos` gallery, the public event pages —
already works and must keep working.

---

## 2. Where the project stands

**Repo:** `C:\Users\prasa\web-apps\fmwa` — React 18 + Vite 5 + react-router-dom 6,
deployed on Vercel at https://fmwa.vercel.app, database and auth on Supabase.

**Run it:**

```
npm run dev      # public site + admin UI, http://localhost:5173
npx vercel dev   # REQUIRED for anything under /api, http://localhost:3000
npm run check    # the only automated tests (node:assert, no framework)
npx vite build   # must succeed before any commit
```

`npm run dev` does **not** serve `/api`. Under it, a request to `/api/users`
returns the source file as `text/javascript`, which is why the admin Users
screen shows an explicit message telling you to use `vercel dev` instead.

**Shipped and working:** public site with festival galleries; day-by-day
timetables with a publish switch; admin and committee sign-in at `/admin`;
committee users restricted to their assigned events; self-service password
change; admin user management.

**Known outstanding, not piece D's job but it will block your testing:**
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **not set in Vercel** for any
environment, so `/api/users` returns `500 Server is not configured.` in
production and locally. Piece D needs its own env vars anyway — set all of them
together. Verify with `npx vercel env ls production`.

---

## 3. Critical context you cannot infer from the code

### 3.1 The Supabase project is shared with other businesses

This Supabase project (`uuzexivlzoxszmnrpryr`) is shared across several
HHAppSolutions sites. `auth.users` contains rows belonging to other companies —
confirmed live: `admin@muralielectronics.local`, `platform@hhappsolutions.local`,
`admin@srimathalunchhome.local`.

Consequences that already shaped the codebase, and that bind piece D too:

- Every database object is prefixed `fmwa_`. Every storage path must be too.
- `api/users.js` scopes **every** verb to `@fortunemeadows.local`. Without that,
  a Fortune Meadows admin could delete or reset the password of another
  company's administrator. That was a real finding, not a hypothetical.
- **Your B2 bucket must be exclusive to this site**, and the application key
  must be scoped to that one bucket. Do not reuse a key that can reach another
  site's data.

### 3.2 The security model, in one paragraph

The real gate is always Postgres RLS, never the client. The `role` value the
browser holds is decoded from the JWT **without verifying the signature**, so it
is purely presentational — it decides what renders, never what is trusted. This
is safe because PostgREST verifies the signature server-side before switching
Postgres roles. **Do not make `role` load-bearing.** If you find yourself
writing "if the user is an admin, skip this filter", stop — the database must
enforce it independently.

Two Postgres roles exist, both `nologin noinherit`, set via `auth.users.role`:

- `fmwa_admin` — full access to `fmwa_*` tables.
- `fmwa_committee` — may read/write timetable rows only for events listed
  against their user id in `fmwa_event_editors`, and may update exactly one
  column of `fmwa_events` (`timetable_published`) via a **column-level grant**.

---

## 4. Existing patterns to follow

| Concern | Pattern | Where |
|---|---|---|
| Public reads | plain `fetch` + anon key, no library | `src/lib/sb.js` |
| Admin reads/writes | `@supabase/supabase-js`, lazy-loaded | `src/lib/auth.js` |
| Privileged operations | Vercel function holding a secret | `api/users.js` |
| Tests | `node:assert`, wired into `npm run check` | `api/users.check.mjs`, `src/data/schedule.check.mjs` |
| Schema | idempotent SQL, safe to re-run | `supabase-setup.sql`, `supabase-timetable.sql` |

**The admin bundle is code-split.** `@supabase/supabase-js` must never reach the
public bundle. Anything importing it must be reachable only from the lazy
`/admin` chunk. After every build, check that `dist/assets/index-*.js` is still
~190 KB and that the growth landed in `Admin-*.js`. `vite.config.js` also carries
`globIgnores: ['**/Admin-*.js', '**/Admin-*.css']` so the service worker does not
precache the admin chunk onto every public visitor's phone.

**Code style:** single quotes, no trailing commas, 100-column width.

```
npx prettier --single-quote --print-width 100 --trailing-comma none --write <files>
```

**`api/users.js` is the template for any new endpoint.** Copy its shape exactly:

1. Return 500 if the env vars are missing.
2. Resolve the caller's own JWT server-side against GoTrue (`/auth/v1/user`) —
   never trust a role claim the client sent.
3. 401 if unresolved; 403 unless the caller's role **and** email domain match.
4. **Only then** read `req.body` or `req.query`.
5. Validate every identifier before it reaches a URL template.

---

## 5. Traps already hit — do not repeat these

Each of these cost a review round or a debugging session in the work so far.

- **Path traversal in a URL template.** `api/users.js` originally interpolated a
  raw query parameter into an admin API path. `..%2F..%2F` normalises, so an
  admin could point a service-role DELETE at any path. Everything that goes into
  a URL or an object key is validated against a strict pattern first. **Object
  keys for B2 are exactly this risk again** — a user-supplied filename must never
  reach the key unsanitised.
- **A catch-all rewrite swallowing real paths.** `vercel.json` used to rewrite
  `/(.*)` to `/index.html`, which under `vercel dev` also caught Vite's own
  module requests — `/src/main.jsx` returned HTML, nothing mounted, no console
  error. It now excludes `/api`, `/assets`, `@`, `src/`, and any path containing
  a dot. If you add a new top-level route or asset path, check it against that
  regex.
- **A shared Postgres role without `usage on schema auth`.** `fmwa_committee`
  policies call `auth.uid()`; the role is `noinherit`, so it needed an explicit
  `grant usage on schema auth`. Without it every committee query failed at
  runtime with a permission error. If you add another role, remember this.
- **HTML5 validation pre-empting JS validation.** Native `required`/`minLength`
  on an input blocks the submit handler, so custom validation messages never
  appear. Bitten once on the password screen.
- **A bare `<button>` inside a form submits it.** Every non-submit button needs
  `type="button"`. Relevant to crop/rotate controls.
- **A rejected fetch cached as a resolved promise.** `src/data/events.js` caches
  in-flight requests at module scope; the catch must clear the cache or one
  flaky request kills the feature for the whole session.
- **A stale service worker from an unrelated project on `localhost:3000`.** If
  the dev site behaves impossibly, check `navigator.serviceWorker.getRegistrations()`
  and `caches.keys()` before debugging the app.

---

## 6. B2 account setup (the user does this)

Backblaze B2, **not** Cloudflare R2 — the user confirmed B2. Use the
**S3-compatible API**, not the older native B2 API: it is better documented and
works with standard tooling.

1. **Create a bucket.** Name it `fmwa-gallery` (globally unique on B2, so add a
   suffix if taken). Set it **Public** — the gallery images are shown to any
   resident with `<img src>`, so public read is correct and avoids signing every
   read. Object keys should still be unguessable (see §8).
2. **Record the endpoint and region.** After creating the bucket, B2 shows an
   endpoint like `s3.us-west-004.backblazeb2.com`. The region is the middle
   part, e.g. `us-west-004`.
3. **Create an Application Key scoped to that bucket only.**
   Account → Application Keys → Add a New Application Key.
   - Name: `fmwa-upload`
   - Allow access to Bucket: **select the one bucket**, never "All"
   - Type of Access: **Read and Write**
   - Leave the file-name prefix empty, or set `events/`
   **Do not use the master application key.** It can reach every bucket in the
   account, which is the same class of mistake as the shared-tenant problem in
   §3.1. The key is shown once — copy `keyID` and `applicationKey` immediately.
4. **Lifecycle rules** (optional but recommended). B2 keeps old versions by
   default, so overwriting an image silently doubles storage. Set the bucket's
   lifecycle to "Keep only the last version".
5. **CORS** — only needed if you choose the presigned-upload architecture in
   §7. The recommended proxy architecture needs no bucket CORS at all.

**Free tier at time of writing:** 10 GB storage, 3× storage in free egress per
day. A colony gallery will not come close.

---

## 7. Architecture decision

### Recommended: client resizes → POST to a Vercel function → function PUTs to B2

```
browser: user picks file
      → canvas resize/crop to the admin-configured limit
      → POST multipart/form-data to /api/upload  (with the user's JWT)
function: verify JWT → check role and event assignment
      → validate type and size again, server-side
      → PUT to B2 with the application key
      → insert the row in fmwa_photos (or set the programme's image column)
      → return the public URL
```

**Why this one:**

- The B2 key never reaches the browser.
- **Size and type are enforced server-side.** This matters: B2's S3-compatible
  API supports presigned `PutObject`, which **cannot** enforce a maximum size —
  the `content-length-range` condition only exists on presigned POST policies,
  which B2 does not support. With presigning you would have to upload first and
  check afterwards.
- No bucket CORS configuration.
- Per-event authorization happens in one place, server-side.

**The constraint:** Vercel serverless functions cap the request body at **4.5 MB**.
This is acceptable *because* piece D resizes client-side first — an image
resized to 1600px on the long edge at JPEG q0.82 lands around 200–400 KB. But
the client resize is then load-bearing, not a nicety: without it, large uploads
fail at the platform boundary with an opaque error. Handle that case explicitly.

### Alternative: presigned PUT, browser uploads straight to B2

Use if you later need files over 4.5 MB (video, PDFs). Requires bucket CORS,
loses server-side size enforcement, and needs a post-upload verification step
that HEADs the object and deletes it if oversized. More moving parts. Do not
start here.

---

## 8. Database changes

New file `supabase-gallery.sql`, idempotent, following the style of
`supabase-timetable.sql` (header comment explaining the steps, `if not exists`
everywhere, `drop policy if exists` before each `create policy`).

### 8.1 Admin-configurable limits

```sql
create table if not exists public.fmwa_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.fmwa_settings (key, value) values
  ('upload', '{"max_bytes": 2097152, "max_edge_px": 1600, "quality": 0.82}')
on conflict (key) do nothing;
```

One row, `key = 'upload'`. `max_bytes` is the hard server-side ceiling;
`max_edge_px` and `quality` drive the client-side resize.

RLS: **anon and committee read, admin writes.** The client needs to read it to
know how to resize before upload, so it must be readable without admin rights.

```sql
alter table public.fmwa_settings enable row level security;
revoke all on public.fmwa_settings from anon, authenticated;
grant select on public.fmwa_settings to anon, fmwa_committee;
grant select, insert, update, delete on public.fmwa_settings to fmwa_admin;
-- policies: select to anon/fmwa_committee using (true); all to fmwa_admin.
```

### 8.2 One image per programme (and per day)

The user asked for "any event/programme time-table". One image, not a gallery,
so this is a column — not a child table.

```sql
alter table public.fmwa_programs   add column if not exists image_url text;
alter table public.fmwa_event_days add column if not exists image_url text;
```

Existing RLS on both tables already restricts writes to the assigned committee
user and to admins, so **no new policy is needed** — the column inherits the
row's protection. Verify this rather than assuming it.

The public read path must include the new column: see `TT_SELECT` in
`src/lib/sb.js`, which currently selects
`date,label,fmwa_events!inner(slug),fmwa_programs(start_time,title,note,sort)`.

### 8.3 Gallery images

`fmwa_photos` already exists (`event_id`, `url`, `caption`, `sort`) with public
read and admin write. Decide and document whether **committee users may upload
to their assigned events' galleries** — the current policy is admin-only, and
the user has not said. Ask before widening it.

---

## 9. Environment variables

Add to Vercel for **development, preview and production** — they are
per-environment, and a deployment bakes them in, so redeploy after adding.

```
B2_KEY_ID           the keyID of the scoped application key
B2_APP_KEY          the applicationKey  (SECRET — never in the repo)
B2_BUCKET           e.g. fmwa-gallery
B2_ENDPOINT         e.g. s3.us-west-004.backblazeb2.com
B2_REGION           e.g. us-west-004
B2_PUBLIC_BASE      the public URL prefix for objects
```

```
npx vercel env add B2_APP_KEY production
npx vercel env pull .env.local
```

`.env*` is gitignored. **Never** import these from anything under `src/` — only
`api/*.js` may read them. After building, grep the bundles to prove it:

```
grep -r "B2_APP_KEY\|B2_KEY_ID" src/ dist/assets/*.js   # must return nothing
```

Signing S3 requests requires AWS SigV4. Either add `@aws-sdk/client-s3` (used
only in `api/`, so it never touches the browser bundle) or hand-roll SigV4.
**Prefer the SDK** — hand-rolled request signing is exactly the kind of code
that is subtly wrong for months.

---

## 10. The upload endpoint

New file `api/upload.js`, modelled on `api/users.js`. Order is not negotiable:

1. 500 if any B2 env var is missing.
2. Resolve the caller's JWT server-side; 401 if it fails.
3. 403 unless the caller's email ends with `@fortunemeadows.local` **and** their
   role is `fmwa_admin` or `fmwa_committee`.
4. **Authorize the target.** A committee user may upload only to an event listed
   against their id in `fmwa_event_editors`. Check this server-side against the
   database — do not trust an `eventId` in the body without checking, and do not
   infer permission from the client's `role`.
5. Read and validate the body: content type must be one of `image/jpeg`,
   `image/png`, `image/webp` — **sniff the magic bytes, do not trust the
   declared MIME type or the extension.** Reject anything over `max_bytes` read
   from `fmwa_settings`.
6. **Build the object key server-side. Never use the client's filename.**
   ```
   events/<eventId>/<crypto.randomUUID()>.<ext-from-sniffed-type>
   ```
   This is the path-traversal lesson from §5, applied to object keys.
7. PUT to B2.
8. Write the database row (`fmwa_photos` insert, or set `image_url`).
9. Return the public URL.

**Delete path.** Whoever can upload should be able to remove. Deleting the
database row must also delete the B2 object, or the bucket fills with orphans.
Decide the failure ordering deliberately: delete the object first and the row
second leaves a broken image on failure; row first leaves an orphan. Prefer
row-first (an orphan is invisible; a broken image is not) and log the orphan.

Add `api/upload.check.mjs` with `node:assert`, wired into `npm run check`,
covering at minimum: the key builder rejects `../` and absolute paths; the
extension mapper rejects an unknown type; the size check rejects a non-number.
Export the constants from `api/upload.js` and import them — do **not** re-declare
them in the test, or the test pins a copy and not the code. (That exact critique
was raised in review of `api/users.check.mjs`.)

---

## 11. Client-side crop and resize

New component, e.g. `src/admin/ImagePicker.jsx`, in the admin chunk.

- Read `fmwa_settings.upload` for `max_edge_px`, `quality`, `max_bytes`.
- On file select: load into an `Image`, draw to a `<canvas>` scaled so the long
  edge is at most `max_edge_px`, export with `canvas.toBlob(cb, 'image/jpeg', quality)`.
- If the result still exceeds `max_bytes`, step quality down and retry a bounded
  number of times, then fail with a clear message. Do not loop unbounded.
- Show a preview and the resulting file size before upload — residents on mobile
  data should see what they are about to send.
- **Crop:** a fixed-aspect crop box is enough; do not build a full editor. If
  you add a library, it must go in the admin chunk only. A simple drag-to-position
  square crop over the preview, drawn with the same canvas, avoids a dependency
  entirely — prefer that first.
- **EXIF orientation:** phone photos carry rotation in EXIF. Drawing to canvas
  discards it, so images will appear sideways unless handled. `createImageBitmap(file, { imageOrientation: 'from-image' })` handles this in modern browsers — use it, with a fallback.
- Strip EXIF otherwise: re-encoding through canvas already drops GPS location,
  which is a privacy win worth keeping. Say so in a comment so nobody "optimises"
  it back by uploading the original bytes.

**Accessibility and mobile:** the committee uses phones. `<input type="file" accept="image/*" capture="environment">` lets them shoot directly. Buttons need `type="button"` (§5).

---

## 12. Admin settings UI

A small screen at `/admin/settings`, **admin only**, editing the `fmwa_settings`
row: max file size (show in MB, store bytes), max edge px, JPEG quality.

Follow the route pattern in `src/admin/Admin.jsx`: declare the route
unconditionally and put the role gate in its `element` — React Router v6 throws
on a `{cond && <Route/>}` child of `<Routes>`. Add the nav link for admins only.

Validate: max bytes between, say, 100 KB and 4 MB (the Vercel body cap is
4.5 MB — do not let the admin set a limit the platform will reject), max edge
between 400 and 4000 px, quality between 0.5 and 0.95. Explain the Vercel cap in
the UI, otherwise a future admin will set 20 MB and be baffled.

---

## 13. Security checklist before merging

- [ ] B2 application key is scoped to the single bucket, not the master key.
- [ ] No B2 credential appears in `src/` or in any built bundle (grep both).
- [ ] The endpoint resolves the caller's JWT server-side and never trusts a
      client-sent role.
- [ ] A committee user cannot upload to an event they are not assigned —
      verified by actually trying it, not by reading the code.
- [ ] Object keys are server-generated; a filename of `../../etc/passwd` or
      `../other-tenant/x.jpg` cannot escape the `events/<id>/` prefix.
- [ ] File type is confirmed by magic bytes, not the declared MIME type.
- [ ] Size is enforced server-side, not only in the browser.
- [ ] Deleting an image removes both the row and the object.
- [ ] Public bundle size unchanged; `@aws-sdk/*` is in `api/` only.

---

## 14. Testing plan

Automated (`npm run check`) covers only pure logic — key building, extension
mapping, size validation. Everything else is manual, because the things worth
verifying are authorization and the browser:

1. Admin sets max size to 1 MB; a 5 MB photo resizes below it and uploads.
2. Admin sets max edge to 800 px; the stored image is 800 px on the long edge.
3. A committee user uploads to their assigned event — succeeds.
4. The same user calls the endpoint directly with another event's id — 403.
5. A sideways phone photo appears upright.
6. Deleting an image removes it from the bucket (check the B2 console).
7. The public event page shows the image without authentication.
8. `npm run check` and `npx vite build` pass; public chunk still ~190 KB.

---

## 15. Open questions for the user

1. **May committee users upload to the event gallery**, or is the gallery
   admin-only and committee users only attach the single programme image?
   Current `fmwa_photos` policy is admin-write.
2. **Should an uploaded image be visible before the timetable is published?**
   The timetable has a publish flag; images currently would not.
3. **Keep the existing `public/assets/*.jpeg` photos** as they are, or migrate
   them to B2? Migration is optional — they ship in the bundle and work offline,
   which B2-hosted images will not.
4. **Is `krishnashtami-6.jpeg` meant to be used?** It has been sitting untracked
   in `public/assets/` for the whole of this work and nothing references it.

---

## 16. First steps for the next session

1. Read this file, then `supabase-timetable.sql` and `api/users.js` — they are
   the two templates you will copy from.
2. Get the user to answer §15 and to complete §6 and §9, including the still-missing
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Nothing under `/api` works until
   those exist, so verify with a real request before building on top.
3. Write `supabase-gallery.sql` and have the user run it; confirm with an anon
   `curl` that `fmwa_settings` is readable and that the new columns exist.
4. Then build, in order: the endpoint, the client picker, the admin settings
   screen, and the public rendering.
