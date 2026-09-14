# Event timetables and committee roles — design

Date: 2026-09-14
Status: approved, not yet implemented
Covers: pieces A (auth + roles), B (timetable + committee admin), C (public timetable)
Deferred: piece D (Backblaze B2 and gallery uploads) — a separate spec

## Problem

Festivals run for a variable number of days — the Ganesh Chaturthi pandal may be
managed for five, seven or nine — and each day carries one or more programs at
set times. Today the site has no way to express this, and no admin section of
any kind: `supabase-setup.sql` lays the seams (an `fmwa_admin` Postgres role,
RLS, a public-read `fmwa` storage bucket) but nothing consumes them.

Two kinds of user are needed. The **admin** runs the whole site and creates
accounts. A **festival committee** member manages the day-by-day schedule for
the events they have been assigned, and nothing else — not other events, not
site copy, not other people's accounts. The committee decides when a schedule
is ready for residents to see, so they hold a publish switch of their own.

## Success criteria

1. An admin can sign in, create a `festival_committee` account, and assign it to
   one or more events.
2. A committee user signs in, sees only their assigned events, adds days with
   real dates and multiple programs per day, and flips one publish switch.
3. Until that switch is on, the schedule is invisible to the public site — not
   merely unrendered, but unreadable by the anonymous database role.
4. Residents see the relevant event's timetable on the home page and each
   event's own timetable on its event page, days ascending by date and programs
   ascending by start time.
5. A committee user cannot read or write another event's timetable, cannot edit
   event titles or blurbs, and cannot reach the users page — enforced in
   Postgres, not only in the UI.

## Non-goals

- Gallery uploads and object storage (piece D).
- Editing event titles, blurbs, accents or photos through the admin — the
  existing `fmwa_events` columns stay admin-only for now.
- Self-service signup, password reset by email, or any public account flow.
  The admin creates every account by hand.
- End times on programs. A colony pooja schedule's end times are guesses, and
  guessed end times age badly once they are public.

## Architecture

### Approach chosen

A second scoped Postgres role, `fmwa_committee`, alongside the existing
`fmwa_admin`, with per-event permission carried by an assignment table and
enforced in RLS.

This extends the pattern already in `supabase-setup.sql` rather than replacing
it. That file's comments are explicit about why the scoped role exists: this
Supabase project is shared with the other HHAppSolutions sites, so a role
granted on `fmwa_*` tables and nothing else "sits one layer below RLS, so it
holds regardless of how permissive another site's policies are." Moving to the
conventional `authenticated`-plus-profiles pattern would give that up, because
`authenticated` is shared across every site on the instance.

Rejected alternatives:

- **Standard `authenticated` role + `fmwa_profiles` table.** Better documented
  and easier for another developer to pick up, but drops the cross-site
  boundary above for no functional gain.
- **All writes through serverless functions.** Deny-all RLS with authorization
  in one application file. Substantially more code — every operation needs an
  endpoint — and it moves authorization out of the database, where it is
  currently enforced for free.

### Data model

```sql
fmwa_event_days
  id          bigint identity pk
  created_at  timestamptz not null default now()
  event_id    bigint not null references fmwa_events(id) on delete cascade
  date        date not null
  label       text                        -- 'Day 3 — Nimajjanam', optional
  unique (event_id, date)

fmwa_programs
  id          bigint identity pk
  created_at  timestamptz not null default now()
  day_id      bigint not null references fmwa_event_days(id) on delete cascade
  start_time  time not null
  title       text not null
  note        text                        -- 'at the pandal', optional
  sort        int not null default 0      -- tiebreak only, for equal start_time

fmwa_event_editors
  user_id     uuid   not null references auth.users(id) on delete cascade
  event_id    bigint not null references fmwa_events(id) on delete cascade
  created_at  timestamptz not null default now()
  primary key (user_id, event_id)

fmwa_events
  + timetable_published  boolean not null default false
```

Indexes: `fmwa_event_days (event_id, date)` and
`fmwa_programs (day_id, start_time, sort)` — both match the only orderings the
app ever asks for.

Notes on the shape:

- A five-, seven- or nine-day pandal is simply five, seven or nine rows in
  `fmwa_event_days`. A single-day event like Independence Day is one row. There
  is no special case for "events without day-wise operations".
- **Events get no start/end date columns.** An event's span is `min(date)` and
  `max(date)` over its days, so a date can only be wrong in one place.
- `sort` exists solely to order two programs that begin at the same minute. It
  is not the primary ordering and the UI does not expose it as a drag handle.

### Roles, grants and RLS

`fmwa_committee` is created exactly like `fmwa_admin`: `nologin noinherit`,
granted to `authenticator`, and put into a user's JWT by setting
`auth.users.role`. It is deliberately not granted `authenticated`, so it
inherits nothing.

Grants:

```sql
grant usage on schema public to fmwa_committee;
grant select on fmwa_events to fmwa_committee;
grant update (timetable_published) on fmwa_events to fmwa_committee;
grant select, insert, update, delete on fmwa_event_days, fmwa_programs to fmwa_committee;
grant select on fmwa_event_editors to fmwa_committee;
```

The **column-level grant** on `timetable_published` is the important line: a
committee user can flip publish and cannot write the title, blurb or accent even
if the admin UI had a bug that sent them. `fmwa_admin` gains `for all` on the
three new tables.

Identity columns own their sequences, so no sequence grants are needed — the
same reason the existing setup file does not grant any.

Policies:

| Table | anon | fmwa_committee | fmwa_admin |
|---|---|---|---|
| `fmwa_events` | select all (existing) | select all; update where assigned | all |
| `fmwa_event_days` | select where parent event published | all where assigned | all |
| `fmwa_programs` | select where parent event published | all where assigned via day | all |
| `fmwa_event_editors` | none | select own rows | all |

"Where assigned" means
`event_id in (select event_id from fmwa_event_editors where user_id = auth.uid())`.
`auth.uid()` reads the JWT's `sub` claim and still resolves after PostgREST
switches into a custom role, so the lookup works under `fmwa_committee`.

The anon read policies test the parent event's flag:

```sql
create policy fmwa_days_public_read on fmwa_event_days for select to anon
  using (exists (select 1 from fmwa_events e
                 where e.id = event_id and e.timetable_published));
```

with the programs policy joining `fmwa_event_days` to `fmwa_events`. There is no
policy cycle: days reference editors and events, programs reference days,
editors and events; nothing references programs.

Unpublished days and programs are therefore **unreadable by anon**, not merely
unrendered by the client. That is success criterion 3.

### The serverless function

`api/users.js`, a Vercel Node function, is the only server-side code. It exists
because creating a Supabase user requires the `service_role` key, which can
never appear in browser JavaScript.

- Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, set in Vercel
  project settings. Never imported by anything under `src/`.
- Every request must carry `Authorization: Bearer <jwt>`. The function resolves
  that token against GoTrue and refuses unless the resulting user's `role` is
  `fmwa_admin`. This check happens before any branch on the request body.
- `GET` — list users, returning only `id`, `email`, `role`, `created_at`.
- `POST {email, password, role}` — validates `role` is one of `fmwa_admin` or
  `fmwa_committee`, the email parses, and the password is at least 10
  characters, then creates the user with `email_confirm: true`.
- `DELETE ?id=` — deletes a user, refusing to delete the caller.

Event assignments are **not** in this function. An admin writes
`fmwa_event_editors` directly through RLS from the browser, which keeps the
privileged endpoint as small as it can be.

### Application structure

```
api/users.js               serverless; the only holder of service_role
src/lib/auth.js            session, sign in/out, role from the JWT
src/data/schedule.js       pure date logic — no imports, no React
src/data/schedule.check.mjs  node:assert self-check for the above
src/data/timetable.js      admin-side reads and writes of days/programs
src/admin/Login.jsx        email + password
src/admin/Admin.jsx        /admin shell and route guard
src/admin/Users.jsx        admin only: create user (role dropdown), assign events
src/admin/Timetable.jsx    day list → programs per day, publish switch
src/designs/a/Timetable.jsx  the public table
```

The whole `/admin` tree is loaded with `React.lazy`, so the public bundle ships
none of it.

**One new dependency: `@supabase/supabase-js`, used only in the admin chunk.**
The existing `src/lib/sb.js` comment is right that two public read calls do not
need the client library, and the public site keeps using plain `fetch`. An
authenticated area is different: access-token refresh, session persistence and
sign-out are security-relevant and fiddly to hand-roll, and this is not a place
to save a few kilobytes. Because the admin routes are code-split, the public
site's bundle is unaffected.

### Public timetable and event selection

One component, `src/designs/a/Timetable.jsx`, rendered in two places: on the home
page for the currently relevant event, and on `/event/:slug` above the gallery.
Days ascending by date, programs within a day ascending by `start_time`, then
`sort`.

Which event the home page shows, in precedence order:

1. an event whose day range spans today;
2. otherwise the nearest **upcoming** event;
3. otherwise the **most recent past** event.

This is a pure function of `(events, today)` and lives in `src/data/schedule.js`
with no React or network imports, so it can be exercised directly:

```js
export function currentEvent(events, today)   // → event | null
```

Timetables are live-only. Unlike `src/data/events.js`, no schedule ships in the
bundle, so the section renders nothing offline or before Supabase responds. The
rest of the page is unaffected, which is the existing behaviour for photos.

Reading the public timetable is one PostgREST request, embedding programs inside
days and the event's slug alongside, ordered in the query rather than the client.
It goes in `src/lib/sb.js` next to the existing `fetchEvents`, using the same
plain `fetch` and the anon key; `src/data/timetable.js` is the admin side only
and is reached solely from the lazy-loaded `/admin` chunk.

## Error handling

- **Supabase unreachable on the public site.** The timetable section does not
  render. The home page, galleries and committee note are bundled and unaffected.
- **Expired access token in admin.** `@supabase/supabase-js` refreshes it. If
  the refresh fails the user is returned to the login screen with their unsaved
  edits still on screen, not discarded.
- **A committee user posts to an event they are not assigned.** RLS returns zero
  rows affected rather than an error; the UI treats "no rows" on a write as a
  permission failure and says so plainly.
- **`api/users.js` called without or with a non-admin token.** 401 and 403
  respectively, with no body detail, before the request is parsed.
- **Duplicate day.** `unique (event_id, date)` rejects it; the UI surfaces "that
  date already exists for this event" rather than the raw constraint name.

## Testing

The pure date logic in `src/data/schedule.js` gets one runnable check,
`src/data/schedule.check.mjs`, using `node:assert` and run with `node`. No test
framework is added. It covers the three precedence branches, the empty-list case,
an event whose days span today, and the boundary where today equals the first or
last day.

Everything else is verified by hand against a real Supabase project, because the
thing worth verifying is the RLS, and that cannot be proved from the client:

1. Sign in as a committee user assigned to one event; confirm the other events
   are absent from the API response, not just hidden in the UI.
2. With the publish flag off, request days and programs with the **anon** key and
   confirm zero rows come back.
3. Attempt an update to `fmwa_events.title` as a committee user and confirm the
   column grant refuses it.
4. Call `api/users.js` with a committee user's token and confirm 403.

## Open items for piece D

Backblaze B2 (not Cloudflare R2) via its S3-compatible API. Deferred entirely:
this spec does not touch the `fmwa` storage bucket or `fmwa_photos`, both of
which keep working exactly as they do now.
