# Piece D — Event gallery uploads on Backblaze B2

Written 2026-09-15 as a handover. **Updated 2026-09-15** after the code was
built: the sections that described work to be done now describe work that
exists, and §4 is a step-by-step of the Backblaze account setup.

**Status: the code is written and passing. The account setup is not done.**
Nothing under `/api` works until §4 and §5 below are complete.

Read §3 and §12 before changing anything — they are the parts that cannot be
inferred from the code.

---

## 1. What piece D adds

1. **Admin-defined upload limits** — max file size, max pixel dimensions and
   JPEG quality, editable at `/admin/settings`, not constants in the source.
2. **One image per programme row** — each entry in a day-by-day timetable, and
   each day itself, can carry exactly one image. Not a gallery, one.
3. **Crop and auto-resize on upload** — the browser shrinks and crops before
   anything is uploaded, so a 12 MP phone photo does not travel over a colony's
   mobile connection at full size.
4. **Per-year galleries** — a photo carries the year it was taken, so 2025's
   Ganesh Chaturthi photos and 2026's sit under the same festival without
   duplicate event rows.

The existing `fmwa_photos` gallery and the public event pages keep working.

---

## 2. What is already built

| File | What it does |
|---|---|
| `supabase-gallery.sql` | New schema. **Not yet run against the database.** |
| `api/upload.js` | The upload endpoint. Holds the B2 key; holds no Supabase service-role key. |
| `api/upload.check.mjs` | Tests for key building, magic-byte sniffing, size limits. |
| `src/data/crop.js` | Crop geometry. Imports nothing, so it runs under plain node. |
| `src/data/upload.js` | Settings, canvas resize/encode, the POST. |
| `src/data/upload.check.mjs` | Tests for `cropBox`. |
| `src/admin/ImagePicker.jsx` | Pick → crop → preview → upload. |
| `src/admin/Settings.jsx` | `/admin/settings`, admin only. |
| `src/admin/Gallery.jsx` | `/admin/event/:id/photos`, per-event gallery. |

Modified: `src/lib/sb.js` (public queries carry `year` and `image_url`),
`src/data/events.js`, `src/data/timetable.js`, `src/components/PhotoGrid.jsx`
(year sections), `src/designs/a/Timetable.jsx` (programme images),
`src/admin/{Admin,EventList,Timetable}.jsx`, three stylesheets, `package.json`.

Verified at the time of writing: `npm run check` passes all four suites,
`npx vite build` succeeds, the public bundle is 190.93 kB with the growth in
`Admin-*.js`, and no B2 credential or `@aws-sdk` reference appears in `src/`
or `dist/`.

---

## 3. Critical context you cannot infer from the code

### 3.1 The Supabase project is shared with other businesses

This Supabase project (`uuzexivlzoxszmnrpryr`) is shared across several
HHAppSolutions sites. `auth.users` contains rows belonging to other companies —
confirmed live: `admin@muralielectronics.local`, `platform@hhappsolutions.local`,
`admin@srimathalunchhome.local`.

- Every database object is prefixed `fmwa_`. Every storage path must be too.
- `api/users.js` and `api/upload.js` scope **every** request to
  `@fortunemeadows.local`. Without that, a Fortune Meadows admin could reach
  another company's account. That was a real finding, not a hypothetical.
- **The B2 bucket must be exclusive to this site**, and the application key
  scoped to that one bucket. This is why §4 step 3 matters.

### 3.2 The security model, in one paragraph

The real gate is always Postgres RLS, never the client. The `role` the browser
holds is decoded from the JWT **without verifying the signature**, so it is
purely presentational — it decides what renders, never what is trusted. This is
safe because PostgREST verifies the signature server-side before switching
Postgres roles. **Do not make `role` load-bearing.**

Two Postgres roles, both `nologin noinherit`, set via `auth.users.role`:

- `fmwa_admin` — full access to `fmwa_*` tables.
- `fmwa_committee` — timetable rows for events listed against their user id in
  `fmwa_event_editors`, one column of `fmwa_events` (`timetable_published`) via
  a column-level grant, and now their own events' rows in `fmwa_photos`.

---

## 4. Backblaze setup — what you do on the B2 site

Do this once. It takes about ten minutes. Everything here happens in the
Backblaze web console; nothing needs the command line until §5.

Backblaze B2, **not** Cloudflare R2 — confirmed. We use the **S3-compatible
API**, so any Backblaze doc page offering you a choice between "B2 Native" and
"S3-Compatible" is asking about that.

### Step 1 — Create the account

1. Go to **https://www.backblaze.com/sign-up/cloud-storage** and create an
   account, or sign in at **https://secure.backblaze.com** if you have one.
2. Verify your email address, and add a phone number when prompted — Backblaze
   requires 2FA before it will let you create application keys.

You do **not** need to enter a card. The free tier is 10 GB of storage and 3×
your stored amount in daily egress, which a colony gallery will not come close
to. Go over and it is roughly $6/TB/month.

### Step 2 — Create the bucket

1. In the left menu choose **B2 Cloud Storage → Buckets**.
2. Click **Create a Bucket**.
3. Fill it in exactly like this:

   | Field | Value | Why |
   |---|---|---|
   | Bucket Unique Name | `fmwa-gallery` | see below |
   | Files in Bucket are | **Public** | residents load photos with a plain `<img src>` — see below |
   | Default Encryption | **Disable** | buys nothing on a public bucket |
   | Object Lock | **Disable** | would break deleting photos |

   **Public is correct because the content is already public.** Gallery photos
   render on the public event page with a plain `<img src>`, with no resident
   login anywhere on the site. A private bucket serves nothing anonymously, so
   every image would need a presigned URL: a server round-trip on every public
   page view, URLs that expire (7 days max) and so cannot be stored in
   `fmwa_photos`, and browser and CDN caching largely defeated because the URL
   changes every time. That is a real cost, paid for a property the content
   does not have.

   Public means someone holding the exact URL can fetch that one object. It
   does not make the bucket browsable — anonymous listing is not available —
   and keys are `events/<id>/<uuid>.jpg`, where the UUID is 122 bits of
   randomness, so they cannot be found by guessing.

   Two consequences to know about, rather than reasons to choose Private:

   - **"Remove photo" does not unpublish the file.** It deletes the database
     row and deliberately leaves the B2 object (§9, §13), so anyone who saved
     the URL earlier can still load it. If a photo ever has to be genuinely
     retracted — a resident asking for their child's picture to come down —
     deleting the row is **not** enough; delete the object in the B2 console
     too. If that request ever becomes routine, the orphan policy is the thing
     to revisit.
   - **No hotlink protection.** Anyone can embed an image and spend your
     egress. The free tier is 3× stored bytes per day, so for a colony gallery
     this is noise, but there is no guard on it.

   The answer flips if there is ever a residents-only gallery behind a login.
   Then the content genuinely is not public and presigned URLs are worth their
   cost.

   **Object Lock must be Disable.** It makes files immutable for a retention
   period, and piece D deletes objects in three places: the orphan cleanup in
   `api/upload.js` when a row write fails, "Remove photo" in the admin gallery,
   and the lifecycle rule in step 5, which works by deleting old versions.
   Object Lock is also close to a one-way door — immutability you can switch
   off is not immutability — so getting this wrong means making a new bucket.

   **Default Encryption should be Disable.** SSE-B2 protects data at rest,
   which is a real protection against someone reaching Backblaze's physical
   disks — and worth nothing here, because this bucket is Public by design and
   every object in it is deliberately readable by anyone holding the URL.
   Against that zero benefit sits a small real risk: Backblaze's own
   documentation notes that server-side-encrypted files "are not currently
   available for direct download via the Backblaze B2 Browse Files page" and
   does not clearly say whether anonymous public URL downloads are affected.
   The entire gallery depends on that anonymous download working.

   Both are changeable later in **Bucket Settings**, and encryption is **not
   retroactive** — switching it on only affects files uploaded afterwards. So
   Disable is the reversible choice in both cases.

   Bucket names are globally unique across all of Backblaze, so if
   `fmwa-gallery` is taken add a suffix — `fmwa-gallery-hyd`, say. **Write down
   whatever you actually used**; it becomes `B2_BUCKET`.

   **Public is correct here.** Gallery photos are shown to any resident with a
   plain `<img src>`, so public read avoids signing every single read. The
   object keys are unguessable UUIDs, which is what keeps them from being
   enumerated.

4. Click **Create a Bucket**.

### Step 3 — Copy the endpoint

Back on the Buckets list, your new bucket now shows an **Endpoint** value like:

```
s3.us-west-004.backblazeb2.com
```

Copy it. Two of your environment variables come straight out of it:

- `B2_ENDPOINT` — the whole thing, `s3.us-west-004.backblazeb2.com`
- `B2_REGION` — the middle part only, `us-west-004`

Your region will likely differ (`us-east-005`, `eu-central-003` and others
exist). Use whatever your bucket actually shows, not the example.

### Step 4 — Create an application key scoped to that one bucket

This is the step that matters most. A key that can reach every bucket in the
account is the same class of mistake as the shared-tenant problem in §3.1.

1. Left menu → **Application Keys**.
2. Click **Add a New Application Key**.
3. Fill it in exactly like this:

   | Field | Value |
   |---|---|
   | Name of Key | `fmwa-upload` |
   | Allow access to Bucket(s) | **select your bucket** — never "All" |
   | Type of Access | **Read and Write** |
   | Allow List All Bucket Names | leave **unticked** |
   | File name prefix | leave empty |
   | Duration (seconds) | leave empty (no expiry) |

   "Allow List All Bucket Names" is only needed for the S3 `ListBuckets`
   operation. `api/upload.js` only ever calls `PutObject` and `DeleteObject`
   against a bucket it already knows by name, so it does not need it — and
   leaving it off keeps the key from even enumerating what else exists.

4. Click **Create New Key**.
5. **The key is shown exactly once and cannot be retrieved afterwards.** Copy
   both values somewhere safe right now:

   - `keyID` — a short string, becomes `B2_KEY_ID`
   - `applicationKey` — a longer string, becomes `B2_APP_KEY`

   If you lose it, delete the key and make another. There is no way to read it
   back. **Do not use the master application key** shown at the top of that
   page — it can reach every bucket in the account.

### Step 5 — Set a lifecycle rule

B2 keeps old versions of a file by default, so overwriting an image silently
doubles what you are storing.

1. Buckets → your bucket → **Lifecycle Settings**.
2. Choose **Keep only the last version of the file**.
3. Save.

### Step 6 — Find your public URL prefix

1. Buckets → your bucket → **Upload/Download**, and upload any small test image
   by hand.
2. Click the uploaded file. The details panel shows a **Friendly URL**.

Strip the filename off the end and what remains is `B2_PUBLIC_BASE`. With the
S3-compatible API it normally looks like:

```
https://fmwa-gallery.s3.us-west-004.backblazeb2.com
```

so a stored object ends up at
`https://fmwa-gallery.s3.us-west-004.backblazeb2.com/events/3/<uuid>.jpg`.

Backblaze also serves a native-API form
(`https://f004.backblazeb2.com/file/fmwa-gallery/...`). Either works for a
public bucket. **Use whichever the console actually showed you**, without a
trailing slash — `api/upload.js` strips one if you leave it, but matching the
console means you have verified the URL rather than assumed it.

Open that test image's URL in a private browser window before moving on. If it
downloads rather than displaying, the bucket is Public and all is well; if you
get an error page, the bucket is still Private — fix that in **Bucket Settings**
before continuing. Delete the test file afterwards.

### What you should have at the end of §4

Six values written down:

```
B2_KEY_ID        e.g. 004a1b2c3d4e5f60000000001
B2_APP_KEY       e.g. K004xxxxxxxxxxxxxxxxxxxxxxxxxxx     (SECRET)
B2_BUCKET        e.g. fmwa-gallery
B2_ENDPOINT      e.g. s3.us-west-004.backblazeb2.com
B2_REGION        e.g. us-west-004
B2_PUBLIC_BASE   e.g. https://fmwa-gallery.s3.us-west-004.backblazeb2.com
```

**CORS:** nothing to do. The browser never talks to B2 directly — it POSTs to
`/api/upload` on our own domain and the serverless function does the PUT. That
is one of the reasons the architecture in §7 was chosen.

---

## 5. Environment variables

Eight for uploads, plus the two `api/users.js` has always needed. They are
per-environment and a deployment bakes them in, so **redeploy after adding**.

```
B2_KEY_ID           from §4 step 4
B2_APP_KEY          from §4 step 4      (SECRET — never in the repo)
B2_BUCKET           from §4 step 2
B2_ENDPOINT         from §4 step 3
B2_REGION           from §4 step 3
B2_PUBLIC_BASE      from §4 step 6
SUPABASE_URL        https://uuzexivlzoxszmnrpryr.supabase.co
SUPABASE_ANON_KEY   the anon key, same one already in src/lib/sb.js
```

> **Changed from the original plan.** `api/upload.js` does **not** use
> `SUPABASE_SERVICE_ROLE_KEY`. It makes every database call as the signed-in
> user, so RLS authorises the upload — see §8. `api/users.js` still needs the
> service-role key, and it is still unset; set it at the same time or the admin
> Users screen stays broken.

Add each one for **development, preview and production**:

```
npx vercel env add B2_APP_KEY production
npx vercel env add B2_APP_KEY preview
npx vercel env add B2_APP_KEY development
```

Then pull them down for local work and confirm what landed:

```
npx vercel env pull .env.local
npx vercel env ls production
```

`.env*` is gitignored. **Never** import these from anything under `src/` — only
`api/*.js` may read them. After building, prove it:

```
grep -r "B2_APP_KEY\|B2_KEY_ID" src/ dist/assets/*.js   # must return nothing
```

---

## 6. Run the schema

`supabase-gallery.sql` has not been run yet. Supabase Studio → SQL Editor,
paste the whole file, run it. It is idempotent and safe to re-run.

It adds:

- `fmwa_settings` — one row, `key = 'upload'`, holding `max_bytes`,
  `max_edge_px` and `quality`. Readable by `fmwa_admin` and `fmwa_committee`,
  writable by admin. Not readable by anon: the picker lives in the admin chunk
  behind the role gate, so anon never needs it.
- `image_url` on `fmwa_programs` and `fmwa_event_days`. No new policy needed —
  the grants in `supabase-timetable.sql` are table-level, and a table-level
  grant covers columns added later. The image therefore inherits
  `timetable_published`, so it stays hidden until the timetable is published.
- `year` on `fmwa_photos`, defaulting to the current year.
- Committee write access to `fmwa_photos`, scoped through `fmwa_event_editors`.

Then verify:

```sql
select key, value from public.fmwa_settings;
select image_url from public.fmwa_programs limit 1;
select year from public.fmwa_photos limit 1;
```

---

## 7. Architecture

```
browser: user picks file
      → canvas crop/resize to the admin-configured limit
      → POST base64 JSON to /api/upload  (with the user's JWT)
function: resolve JWT → check role and email domain
      → ask the database whether this user may touch this event
      → sniff magic bytes, re-check size server-side
      → PUT to B2 with the application key
      → write the row as the caller, so RLS checks again
      → return the public URL
```

**Why this and not a presigned PUT:**

- The B2 key never reaches the browser.
- **Size and type are enforced server-side.** B2's S3 API supports presigned
  `PutObject`, which **cannot** enforce a maximum size — the
  `content-length-range` condition only exists on presigned POST policies,
  which B2 does not support. With presigning you would upload first and check
  afterwards.
- No bucket CORS configuration.

**The constraint:** Vercel caps a request body at **4.5 MB**. The client resize
is therefore load-bearing, not a nicety. `api/upload.js` clamps the admin's
`max_bytes` to `HARD_MAX` (4.5 MB × 0.72, allowing for base64 overhead) so an
admin cannot set a limit the platform will reject, and `/admin/settings`
refuses to offer one.

If you ever need files over 4.5 MB (video, PDFs), that is the point to revisit
presigned PUT — with bucket CORS and a post-upload HEAD-and-delete step. Do not
start there.

---

## 8. How authorisation actually works

The original plan had `api/upload.js` hold the service-role key and check
`fmwa_event_editors` by hand. It does not. Every database call in that file
runs against PostgREST **with the caller's own JWT**, so the RLS policies are
what authorise the upload, in line with §3.2.

| Question | Answered by |
|---|---|
| Is this a real committee user? | Their JWT, resolved server-side against GoTrue |
| May they touch this event? | RLS on `fmwa_event_editors`, read as them, before the B2 PUT |
| May they write this row? | RLS again on the insert/update, after the PUT |
| Is this really a JPEG, really under the limit? | **Only the server-side check** |

The check runs twice on purpose. The first is before the upload so a refused
request never leaves an orphan object in the bucket; the second is the real
one, because it is the write itself. If the row write fails, the object is
deleted again rather than left as litter.

### Why a client-held key would not help

**A shared app secret shipped to the browser is not a secret.** Whatever token
the page holds in order to call the endpoint, the person using that page can
read — DevTools → Network → "copy as cURL". Adding an app-level key to "stop
direct access" just publishes a longer string.

And authentication answers a different question from the one a size limit asks.
The app already sends a per-user JWT and the endpoint already verifies it. That
proves *who* is calling. It cannot prove that the caller's browser ran the
canvas resize first — a legitimately signed-in committee member can POST a
50 MB file with a perfectly valid token, by accident (a broken resize path) or
on purpose.

So the client-side resize is for **user experience** and the server checks are
the **enforcement**. Both are needed; neither substitutes for the other. If
abuse by an authenticated user ever becomes real, the answer is rate limiting
per user id, not a client-held key.

---

## 9. Decisions taken during the build

Four places the implementation departs from the original plan, all deliberate:

1. **No service-role key in `api/upload.js`** — see §8.
2. **`year` went on `fmwa_photos`, not on `fmwa_events`.** A festival is one
   event row forever; 2025 and 2026 are instances of it. Timetables were
   already year-aware because `fmwa_event_days.date` is a real date with
   `unique (event_id, date)`, so only photos needed the column. No duplicate
   `Ganesh Chaturthi 2025` event row was created.
3. **Crop is an aspect choice plus a position slider**, not a drag-to-position
   box. A native `<input type="range">` already works with a thumb, a keyboard
   and a screen reader; a hand-built drag handle would not. Add a real crop
   rectangle if the committee asks for off-centre crops the slider cannot reach.
4. **Committee users may write their own events' galleries**, which the
   original left as an open question. Note the asymmetry this creates: a
   programme image is hidden until the timetable is published, but a **gallery
   photo is public the moment it is uploaded**, because `fmwa_events` has no
   publish flag. `Gallery.jsx` says so on screen. If gallery photos should also
   wait for a switch, that needs its own flag and is not piece D.

---

## 10. Existing patterns to follow

| Concern | Pattern | Where |
|---|---|---|
| Public reads | plain `fetch` + anon key, no library | `src/lib/sb.js` |
| Admin reads/writes | `@supabase/supabase-js`, lazy-loaded | `src/lib/auth.js` |
| Privileged operations | Vercel function holding a secret | `api/users.js`, `api/upload.js` |
| Tests | `node:assert`, wired into `npm run check` | `*.check.mjs` |
| Schema | idempotent SQL, safe to re-run | `supabase-*.sql` |
| Pure logic worth testing | its own import-free module | `src/data/schedule.js`, `src/data/crop.js` |

**The admin bundle is code-split.** `@supabase/supabase-js` and
`@aws-sdk/client-s3` must never reach the public bundle. After every build,
check `dist/assets/index-*.js` is still ~190 KB and that growth landed in
`Admin-*.js`. `vite.config.js` carries
`globIgnores: ['**/Admin-*.js', '**/Admin-*.css']` so the service worker does
not precache the admin chunk onto every public visitor's phone.

**Code style:** single quotes, no trailing commas, 100-column width.

```
npx prettier --single-quote --print-width 100 --trailing-comma none --write <files>
```

**Two constants are duplicated on purpose.** `VERCEL_CAP` and `HARD_MAX` exist
in both `api/upload.js` and `src/data/upload.js`, because the API module
imports `@aws-sdk/client-s3` and must never be reachable from the browser.
`api/upload.check.mjs` compares the two copies as text and fails if they drift.
Same deliberate duplication as `SITE` between `api/users.js` and
`src/lib/auth.js`.

---

## 11. Run it

```
npm run dev      # public site + admin UI, http://localhost:5173
npx vercel dev   # REQUIRED for anything under /api, http://localhost:3000
npm run check    # four node:assert suites, no framework
npx vite build   # must succeed before any commit
```

`npm run dev` does **not** serve `/api`. Under it a request to `/api/upload`
returns the source file as `text/javascript`; `src/data/upload.js` detects the
wrong content type and says so plainly rather than failing on a JSON parse.

---

## 12. Traps already hit — do not repeat these

- **Path traversal in a URL template.** `api/users.js` originally interpolated
  a raw query parameter into an admin API path; `..%2F..%2F` normalises. In
  `api/upload.js` the object key is *built*, never accepted: event id must be a
  positive integer, the extension comes from the sniffed magic bytes, and the
  filename is a fresh UUID. Traversal is unreachable by construction, not
  filtered.
- **A catch-all rewrite swallowing real paths.** `vercel.json` used to rewrite
  `/(.*)` to `/index.html`, which under `vercel dev` also caught Vite's own
  module requests — `/src/main.jsx` returned HTML, nothing mounted, no console
  error. It now excludes `/api`, `/assets`, `@`, `src/`, and any path
  containing a dot. Check any new top-level route against that regex.
- **A shared Postgres role without `usage on schema auth`.** `fmwa_committee`
  policies call `auth.uid()`; the role is `noinherit`, so it needed an explicit
  `grant usage on schema auth`. Without it every committee query failed at
  runtime with a permission error.
- **HTML5 validation pre-empting JS validation.** Native `required`/`min`/`max`
  on an input blocks the submit handler, so custom messages never appear.
  `Settings.jsx` validates in JS for exactly this reason.
- **A bare `<button>` inside a form submits it.** Every non-submit button needs
  `type="button"`. All of `ImagePicker.jsx`'s controls do.
- **A rejected fetch cached as a resolved promise.** `src/data/events.js` caches
  in-flight requests at module scope; the catch must clear the cache or one
  flaky request kills the feature for the whole session.
- **Object URLs are not garbage collected.** `ImagePicker.jsx` revokes in a
  `useEffect` cleanup and nowhere else — revoking inside a `setState` updater
  fires twice under StrictMode, because updaters are meant to be pure.
- **EXIF orientation.** Drawing to a canvas discards the rotation tag, so phone
  photos come out sideways. `createImageBitmap(file, { imageOrientation:
  'from-image' })` handles it, with a fallback for older Safari. Re-encoding
  also strips GPS coordinates, which is a privacy win — do not "optimise" it
  away by uploading the original bytes.
- **A stale service worker from an unrelated project on `localhost:3000`.** If
  the dev site behaves impossibly, check
  `navigator.serviceWorker.getRegistrations()` and `caches.keys()` before
  debugging the app.

---

## 13. Still to do

**Migrating the bundled photos to B2.** Decided but not started, and blocked on
§4 and §5. The plan:

1. Upload `public/assets/*.jpeg` to B2 and insert `fmwa_photos` rows pointing
   at them, with the right `year` — the Ganesh photos (`ganesha-1/2/3.jpeg`)
   are **2025**. The year for the Independence Day and Krishnashtami photos has
   not been confirmed; ask before guessing, because a wrong year is published
   to residents. Until a row has a year, the gallery renders it with no heading,
   which is what the bundled photos do today.
2. Only once those URLs are verified in a browser, strip the `photos` arrays
   from `src/data/events.js` and delete the files.

**Do not do step 2 before step 1 is verified.** The decision was "B2 is the only
copy", so deleting early puts the only copies in git history. It also ends the
gallery's offline rendering — that is understood and accepted, but it is
irreversible from the user's point of view, so it wants a deliberate pass.

**`public/assets/krishnashtami-6.jpeg`** is untracked and referenced by nothing.
It is exactly the same byte size as `krishnashtami-4.jpeg` (2,422,437), so it is
very likely a duplicate. Eyeball the two before either gets uploaded; if it is a
duplicate, delete it.

---

## 14. Security checklist before merging

- [ ] B2 application key is scoped to the single bucket, not the master key.
- [ ] No B2 credential appears in `src/` or in any built bundle (grep both).
- [ ] The endpoint resolves the caller's JWT server-side and never trusts a
      client-sent role.
- [ ] A committee user cannot upload to an event they are not assigned —
      verified by actually trying it, not by reading the code.
- [ ] Object keys are server-generated; a filename of `../../etc/passwd` cannot
      escape the `events/<id>/` prefix.
- [ ] File type is confirmed by magic bytes, not the declared MIME type.
- [ ] Size is enforced server-side, not only in the browser.
- [ ] Deleting an image removes the row; the orphaned object is accepted and
      documented, not accidental.
- [ ] Public bundle still ~190 KB; `@aws-sdk/*` is in `api/` only.

---

## 15. Testing plan

`npm run check` covers only pure logic — key building, magic-byte sniffing,
size validation, crop geometry, and the duplicated-constant guard. Everything
below is manual, because what is worth verifying is authorisation and the
browser. Run these under `npx vercel dev`, not `npm run dev`.

1. Admin sets max size to 1 MB; a 5 MB photo resizes below it and uploads.
2. Admin sets max edge to 800 px; the stored image is 800 px on the long edge.
3. A committee user uploads to their assigned event — succeeds.
4. The same user POSTs to `/api/upload` with another event's id — **403**, and
   no object appears in the bucket.
5. A sideways phone photo appears upright.
6. A photo uploaded as 2025 appears under a 2025 heading, below 2026.
7. A programme image stays invisible to residents until the timetable is
   published; a gallery photo is visible immediately.
8. Deleting a gallery photo removes it from the public page.
9. The public event page shows images without authentication.
10. `npm run check` and `npx vite build` pass; public chunk still ~190 KB.

---

## 16. First steps for the next session

1. Read §3, §8 and §12.
2. Do §4 (the Backblaze console) and §5 (the environment variables), then §6
   (run the schema). Verify with a real upload before building on top.
3. Walk §15 items 3 and 4 — the authorisation cases — before anything else.
4. Then the migration in §13, in the stated order.
