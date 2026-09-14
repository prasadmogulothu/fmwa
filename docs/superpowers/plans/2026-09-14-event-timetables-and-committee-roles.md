# Event Timetables and Committee Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let festival committee users manage day-by-day programme schedules for the events they are assigned, publish them with one switch, and show the published schedule to residents on the home and event pages.

**Architecture:** A second scoped Postgres role (`fmwa_committee`) alongside the existing `fmwa_admin`, with per-event permission held in an assignment table and enforced by RLS — so an unpublished schedule is unreadable by the anonymous role, not merely unrendered. One Vercel serverless function holds the `service_role` key and does the only thing that requires it: creating and deleting users. The public site keeps its plain-`fetch`/anon-key reads; the admin area is a lazy-loaded chunk.

**Tech Stack:** React 18, react-router-dom 6, Vite 5, Supabase (Postgres + GoTrue + PostgREST), Vercel serverless functions, `@supabase/supabase-js` (admin chunk only).

**Spec:** `docs/superpowers/specs/2026-09-14-event-timetable-and-roles-design.md`

## Global Constraints

- Every database object is prefixed `fmwa_` — the Supabase project is shared with other HHAppSolutions sites.
- `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel project settings and read only by `api/users.js`. Nothing under `src/` may import or reference it.
- `@supabase/supabase-js` may only be imported from files under `src/admin/`, `src/lib/auth.js`, and `src/data/timetable.js` — all reachable solely from the lazy-loaded `/admin` chunk. The public site keeps plain `fetch` with the anon key in `src/lib/sb.js`.
- No test framework is added. The only automated check is `node src/data/schedule.check.mjs` using `node:assert`.
- Programs have a start time only. No end-time column, field, or UI.
- `fmwa_events` gains exactly one new column, `timetable_published`. No start/end date columns — an event's span derives from `min`/`max` of its days.
- Code style, matching the existing source: single quotes, no trailing commas, 100-column print width. Format with `npx prettier --single-quote --print-width 100 --trailing-comma none --write <files>`.
- Dates are handled as `'YYYY-MM-DD'` strings and compared as strings. Never call `new Date('2026-09-14')` — that parses as UTC midnight and shifts back a day for anyone east of Greenwich.

---

### Task 1: Database schema, committee role and RLS

Creates the tables, the second Postgres role, and the policies that make an unpublished timetable invisible to anon. Also creates a committee user by hand so Tasks 4 and 5 have someone to sign in as — Task 6 automates that later.

**Files:**
- Create: `supabase-timetable.sql`
- Modify: `README.md` (Supabase section)

**Interfaces:**
- Consumes: `fmwa_events`, `fmwa_admin` from the existing `supabase-setup.sql`.
- Produces: tables `fmwa_event_days(id, created_at, event_id, date, label)`, `fmwa_programs(id, created_at, day_id, start_time, title, note, sort)`, `fmwa_event_editors(user_id, event_id, created_at)`; column `fmwa_events.timetable_published boolean not null default false`; Postgres role `fmwa_committee`.

- [ ] **Step 1: Write the migration file**

Create `supabase-timetable.sql`:

```sql
-- Fortune Meadows — event timetables and the festival committee role.
-- Supabase Studio → SQL Editor. Safe to re-run.
--
-- Run supabase-setup.sql first: this file assumes fmwa_events and fmwa_admin
-- already exist.
--
-- STEP 1  run everything down to the ==== STEP 2 ==== marker
-- STEP 2  Authentication → Users → Add user
--           email    committee@fortunemeadows.local
--           password of your choosing, Auto Confirm User ON
-- STEP 3  run the statements below the marker (they need the user to exist)

-- ------------------------------------------------------------- tables
alter table public.fmwa_events
  add column if not exists timetable_published boolean not null default false;

create table if not exists public.fmwa_event_days (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_id   bigint not null references public.fmwa_events(id) on delete cascade,
  date       date not null,
  label      text,
  unique (event_id, date)
);
create index if not exists fmwa_event_days_event_idx
  on public.fmwa_event_days (event_id, date);

create table if not exists public.fmwa_programs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  day_id     bigint not null references public.fmwa_event_days(id) on delete cascade,
  start_time time not null,
  title      text not null,
  note       text,
  sort       int not null default 0
);
create index if not exists fmwa_programs_day_idx
  on public.fmwa_programs (day_id, start_time, sort);

create table if not exists public.fmwa_event_editors (
  user_id    uuid   not null references auth.users(id) on delete cascade,
  event_id   bigint not null references public.fmwa_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ------------------------------------------------------ committee role
-- NOLOGIN, like fmwa_admin: only ever reached by PostgREST switching into it,
-- and deliberately not granted `authenticated`, so it inherits nothing.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fmwa_committee') then
    create role fmwa_committee nologin noinherit;
  end if;
end $$;
grant fmwa_committee to authenticator;
grant usage on schema public to fmwa_committee;

grant select on public.fmwa_events to fmwa_committee;
-- Column-level: a committee user can flip publish and cannot write the title,
-- blurb or accent even if the admin UI sent them by mistake.
grant update (timetable_published) on public.fmwa_events to fmwa_committee;
grant select, insert, update, delete
  on public.fmwa_event_days, public.fmwa_programs to fmwa_committee;
grant select on public.fmwa_event_editors to fmwa_committee;

grant select, insert, update, delete
  on public.fmwa_event_days, public.fmwa_programs, public.fmwa_event_editors
  to fmwa_admin;

-- --------------------------------------------------------------- RLS
alter table public.fmwa_event_days    enable row level security;
alter table public.fmwa_programs      enable row level security;
alter table public.fmwa_event_editors enable row level security;

-- Strip the blanket grants Supabase hands every table in `public`, then give
-- anon read-only access to the two timetable tables. Assignments are private.
revoke all on public.fmwa_event_days, public.fmwa_programs,
              public.fmwa_event_editors from anon, authenticated;
grant select on public.fmwa_event_days, public.fmwa_programs to anon;

-- public: published timetables only
drop policy if exists fmwa_days_public_read on public.fmwa_event_days;
create policy fmwa_days_public_read on public.fmwa_event_days
  for select to anon
  using (exists (select 1 from public.fmwa_events e
                  where e.id = event_id and e.timetable_published));

drop policy if exists fmwa_programs_public_read on public.fmwa_programs;
create policy fmwa_programs_public_read on public.fmwa_programs
  for select to anon
  using (exists (select 1
                   from public.fmwa_event_days d
                   join public.fmwa_events e on e.id = d.event_id
                  where d.id = day_id and e.timetable_published));

-- admin: everything
drop policy if exists fmwa_days_admin_all on public.fmwa_event_days;
create policy fmwa_days_admin_all on public.fmwa_event_days
  for all to fmwa_admin using (true) with check (true);

drop policy if exists fmwa_programs_admin_all on public.fmwa_programs;
create policy fmwa_programs_admin_all on public.fmwa_programs
  for all to fmwa_admin using (true) with check (true);

drop policy if exists fmwa_editors_admin_all on public.fmwa_event_editors;
create policy fmwa_editors_admin_all on public.fmwa_event_editors
  for all to fmwa_admin using (true) with check (true);

-- committee: their assigned events only. auth.uid() reads the JWT's `sub`
-- claim and still resolves after PostgREST switches into fmwa_committee.
drop policy if exists fmwa_editors_own on public.fmwa_event_editors;
create policy fmwa_editors_own on public.fmwa_event_editors
  for select to fmwa_committee using (user_id = auth.uid());

drop policy if exists fmwa_events_committee_read on public.fmwa_events;
create policy fmwa_events_committee_read on public.fmwa_events
  for select to fmwa_committee using (true);

drop policy if exists fmwa_events_committee_publish on public.fmwa_events;
create policy fmwa_events_committee_publish on public.fmwa_events
  for update to fmwa_committee
  using (id in (select event_id from public.fmwa_event_editors
                 where user_id = auth.uid()))
  with check (id in (select event_id from public.fmwa_event_editors
                      where user_id = auth.uid()));

drop policy if exists fmwa_days_committee_all on public.fmwa_event_days;
create policy fmwa_days_committee_all on public.fmwa_event_days
  for all to fmwa_committee
  using (event_id in (select event_id from public.fmwa_event_editors
                       where user_id = auth.uid()))
  with check (event_id in (select event_id from public.fmwa_event_editors
                            where user_id = auth.uid()));

drop policy if exists fmwa_programs_committee_all on public.fmwa_programs;
create policy fmwa_programs_committee_all on public.fmwa_programs
  for all to fmwa_committee
  using (exists (select 1 from public.fmwa_event_days d
                   join public.fmwa_event_editors ed on ed.event_id = d.event_id
                  where d.id = day_id and ed.user_id = auth.uid()))
  with check (exists (select 1 from public.fmwa_event_days d
                        join public.fmwa_event_editors ed on ed.event_id = d.event_id
                       where d.id = day_id and ed.user_id = auth.uid()));

-- ============================ STEP 2 ============================
-- Create committee@fortunemeadows.local in Studio, then run the rest.

-- ============================ STEP 3 ============================
-- Must report "UPDATE 1".
update auth.users
   set role = 'fmwa_committee'
 where email = 'committee@fortunemeadows.local';

-- Assign that user to Ganesh Chaturthi so there is something to edit.
insert into public.fmwa_event_editors (user_id, event_id)
select u.id, e.id
  from auth.users u, public.fmwa_events e
 where u.email = 'committee@fortunemeadows.local'
   and e.slug = 'ganesh-chaturthi'
on conflict do nothing;
```

- [ ] **Step 2: Run it in Supabase Studio**

Open Supabase Studio → SQL Editor, paste `supabase-timetable.sql`, and follow the three steps in its header. Step 3's `update auth.users` must report `UPDATE 1`; if it reports `UPDATE 0`, the user in Step 2 was not created with that exact email.

- [ ] **Step 3: Verify anon cannot read an unpublished timetable**

Insert one day and one program by hand in Studio's SQL Editor (Ganesh Chaturthi is still unpublished):

```sql
insert into public.fmwa_event_days (event_id, date, label)
select id, '2026-09-15', 'Day 1 — Sthapana' from public.fmwa_events
 where slug = 'ganesh-chaturthi'
on conflict do nothing;

insert into public.fmwa_programs (day_id, start_time, title, note)
select d.id, '06:30', 'Suprabhatam & Abhishekam', 'at the pandal'
  from public.fmwa_event_days d
  join public.fmwa_events e on e.id = d.event_id
 where e.slug = 'ganesh-chaturthi' and d.date = '2026-09-15';
```

Then query as anon. The key is in `src/lib/sb.js:6`:

```bash
ANON='<the SB_KEY string from src/lib/sb.js>'
SB='https://uuzexivlzoxszmnrpryr.supabase.co'
curl -s "$SB/rest/v1/fmwa_event_days?select=date,label" -H "apikey: $ANON"
curl -s "$SB/rest/v1/fmwa_programs?select=start_time,title" -H "apikey: $ANON"
```

Expected: both return exactly `[]`. If either returns rows, the anon policy is wrong — stop and fix before continuing.

- [ ] **Step 4: Verify anon CAN read it once published**

```sql
update public.fmwa_events set timetable_published = true where slug = 'ganesh-chaturthi';
```

Re-run both `curl` commands. Expected: one day row and one program row. Then turn it back off so Task 5 can exercise the switch:

```sql
update public.fmwa_events set timetable_published = false where slug = 'ganesh-chaturthi';
```

- [ ] **Step 5: Verify the committee user's scope**

Get a committee access token and query with it:

```bash
TOKEN=$(curl -s "$SB/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"committee@fortunemeadows.local","password":"<the password you set>"}' \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

# assigned event: returns the day row
curl -s "$SB/rest/v1/fmwa_event_days?select=date,event_id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# writing a title must be refused by the column grant
curl -s -X PATCH "$SB/rest/v1/fmwa_events?slug=eq.ganesh-chaturthi" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"hacked"}'
```

Expected: the first returns only rows for Ganesh Chaturthi; the second returns a `42501` error, `permission denied for table fmwa_events` (Postgres does not name the column in column-privilege failures).

- [ ] **Step 6: Update the README**

In `README.md`, under the `## Supabase` section, after the existing bullet list, add:

```markdown
Then run `supabase-timetable.sql` and follow its three steps. It adds:

- `fmwa_event_days`, `fmwa_programs` — the day-by-day programme for an event.
  Public read only when the parent event has `timetable_published = true`.
- `fmwa_event_editors` — which committee user may edit which event.
- the `fmwa_committee` Postgres role, which can write timetables for its
  assigned events and flip `fmwa_events.timetable_published`, and nothing else.
  The restriction to that one column is a Postgres column-level grant, not a
  UI convention.
```

- [ ] **Step 7: Commit**

```bash
git add supabase-timetable.sql README.md
git commit -m "Timetable tables, fmwa_committee role and RLS"
```

---

### Task 2: Pure date and formatting logic

The only automated check in this plan. Everything here is a pure function of its arguments so it can run under plain `node` with no bundler, no React and no network.

**Files:**
- Create: `src/data/schedule.js`
- Create: `src/data/schedule.check.mjs`
- Modify: `package.json` (add a `check` script)

**Interfaces:**
- Consumes: nothing. This file must have zero imports.
- Produces:
  - `today(now = new Date()) -> 'YYYY-MM-DD'`
  - `span(ev) -> { first: 'YYYY-MM-DD', last: 'YYYY-MM-DD' } | null`
  - `currentEvent(events, day) -> event | null` where each `event` has a `days` array of `{ date }`
  - `clock(t) -> '6:30 AM'` from a Postgres `time` like `'06:30:00'`
  - `dayLabel(d) -> 'Tue, 15 Sep'` from `'YYYY-MM-DD'`

- [ ] **Step 1: Write the failing check**

Create `src/data/schedule.check.mjs`:

```js
// Run: node src/data/schedule.check.mjs
// The only automated test in this project. Everything it covers is pure.
import assert from 'node:assert/strict';
import { today, span, currentEvent, clock, dayLabel } from './schedule.js';

const ev = (slug, ...dates) => ({ slug, days: dates.map((date) => ({ date })) });

// --- today ------------------------------------------------------------
assert.equal(today(new Date(2026, 8, 14)), '2026-09-14');
assert.equal(today(new Date(2026, 0, 5)), '2026-01-05', 'pads month and day');

// --- span -------------------------------------------------------------
assert.equal(span(ev('x')), null, 'an event with no days has no span');
assert.deepEqual(span(ev('x', '2026-09-17', '2026-09-15', '2026-09-16')), {
  first: '2026-09-15',
  last: '2026-09-17'
});

// --- currentEvent -----------------------------------------------------
assert.equal(currentEvent([], '2026-09-14'), null);
assert.equal(currentEvent([ev('x')], '2026-09-14'), null, 'no days, no answer');

const past = ev('past', '2026-08-14', '2026-08-15');
const running = ev('running', '2026-09-13', '2026-09-15');
const soon = ev('soon', '2026-09-20');
const later = ev('later', '2026-10-02');

assert.equal(currentEvent([past, running, soon], '2026-09-14').slug, 'running');
assert.equal(currentEvent([past, running, soon], '2026-09-13').slug, 'running', 'first day counts');
assert.equal(currentEvent([past, running, soon], '2026-09-15').slug, 'running', 'last day counts');
assert.equal(currentEvent([past, soon, later], '2026-09-16').slug, 'soon', 'nearest upcoming');
assert.equal(currentEvent([later, soon], '2026-09-16').slug, 'soon', 'order does not matter');

const older = ev('older', '2026-07-01');
assert.equal(currentEvent([older, past], '2026-12-01').slug, 'past', 'most recent past');

// Two festivals overlapping: show the one that started most recently.
const a = ev('a', '2026-09-10', '2026-09-18');
const b = ev('b', '2026-09-13', '2026-09-16');
assert.equal(currentEvent([a, b], '2026-09-14').slug, 'b');

// --- clock ------------------------------------------------------------
assert.equal(clock('06:30:00'), '6:30 AM');
assert.equal(clock('18:05:00'), '6:05 PM');
assert.equal(clock('00:15:00'), '12:15 AM', 'midnight is 12, not 0');
assert.equal(clock('12:00:00'), '12:00 PM', 'noon is PM');
assert.equal(clock('09:00'), '9:00 AM', 'seconds are optional');

// --- dayLabel ---------------------------------------------------------
// Parsed as a local date, never as UTC — '2026-09-15' must not become the 14th.
assert.match(dayLabel('2026-09-15'), /15/);
assert.match(dayLabel('2026-09-15'), /Sep/);

console.log('schedule.js OK');
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node src/data/schedule.check.mjs
```

Expected: FAIL — `Cannot find module ... schedule.js`.

- [ ] **Step 3: Write the implementation**

Create `src/data/schedule.js`:

```js
// Pure date and time helpers for event timetables. No imports on purpose: this
// file runs under plain node so src/data/schedule.check.mjs can exercise it
// without a bundler.
//
// Everything here treats a date as the string Postgres gives us,
// 'YYYY-MM-DD', and compares those strings directly. `new Date('2026-09-15')`
// parses as UTC midnight and reads back as the 14th anywhere east of
// Greenwich, so it is never used.

export function today(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// An event's span is derived from its days — there are no date columns on the
// event itself, so a date can only ever be wrong in one place.
export function span(ev) {
  const dates = (ev.days || []).map((d) => d.date).sort();
  return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null;
}

// Which event the home page shows: one running today, else the nearest
// upcoming, else the most recent past. Null when no event has any days.
export function currentEvent(events, day) {
  const dated = (events || []).map((e) => ({ e, s: span(e) })).filter((x) => x.s);
  if (!dated.length) return null;

  const running = dated.filter((x) => x.s.first <= day && day <= x.s.last);
  if (running.length) {
    // Two festivals can overlap; show whichever started most recently.
    running.sort((a, b) => b.s.first.localeCompare(a.s.first));
    return running[0].e;
  }

  const upcoming = dated.filter((x) => x.s.first > day);
  if (upcoming.length) {
    upcoming.sort((a, b) => a.s.first.localeCompare(b.s.first));
    return upcoming[0].e;
  }

  const over = dated.filter((x) => x.s.last < day);
  over.sort((a, b) => b.s.last.localeCompare(a.s.last));
  return over.length ? over[0].e : null;
}

// '06:30:00' -> '6:30 AM'. Postgres time columns come back with seconds.
export function clock(t) {
  const [h, m] = t.split(':');
  const hour = Number(h);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

// '2026-09-15' -> 'Tue, 15 Sep'
export function dayLabel(d) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
}
```

- [ ] **Step 4: Run the check to verify it passes**

```bash
node src/data/schedule.check.mjs
```

Expected: `schedule.js OK` and exit code 0.

- [ ] **Step 5: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"check": "node src/data/schedule.check.mjs"
```

Run `npm run check` and confirm it prints `schedule.js OK`.

- [ ] **Step 6: Commit**

```bash
npx prettier --single-quote --print-width 100 --trailing-comma none --write src/data/schedule.js src/data/schedule.check.mjs
git add src/data/schedule.js src/data/schedule.check.mjs package.json
git commit -m "Pure schedule logic with a node:assert check"
```

---

### Task 3: Public timetable on the home and event pages

Reads published timetables with the anon key and renders them. Independently verifiable: publish Ganesh Chaturthi in Studio and the table appears; unpublish and it vanishes.

**Files:**
- Modify: `src/lib/sb.js` (add `fetchTimetable`)
- Modify: `src/data/events.js` (add `useTimetable`)
- Create: `src/designs/a/Timetable.jsx`
- Modify: `src/designs/a/Home.jsx`
- Modify: `src/designs/a/Event.jsx`
- Modify: `src/designs/a/style.css`

**Interfaces:**
- Consumes: `currentEvent`, `today`, `clock`, `dayLabel` from `src/data/schedule.js`; `useEvents` from `src/data/events.js`.
- Produces:
  - `fetchTimetable() -> Promise<Map<slug, Day[]>>` where `Day` is `{ date, label, programs: [{ start, title, note }] }`
  - `useTimetable() -> { timetable: Map<slug, Day[]>, ready: boolean }`
  - default export `Timetable({ days, title })` from `src/designs/a/Timetable.jsx`

- [ ] **Step 1: Add the public read**

Append to `src/lib/sb.js`:

```js
// One request: every published day with its programs embedded and the parent
// event's slug alongside, ordered in the query rather than in the client.
// Unpublished rows are filtered by RLS, not here.
const TT_SELECT =
  'select=date,label,fmwa_events!inner(slug),fmwa_programs(start_time,title,note,sort)' +
  '&order=date.asc&fmwa_programs.order=start_time.asc,sort.asc';

export async function fetchTimetable() {
  const r = await fetch(`${SB_URL}/rest/v1/fmwa_event_days?${TT_SELECT}`, { headers: HEAD });
  if (!r.ok) throw new Error('fmwa_event_days ' + r.status);
  const rows = await r.json();
  const by = new Map();
  for (const row of rows) {
    const slug = row.fmwa_events?.slug;
    if (!slug) continue;
    if (!by.has(slug)) by.set(slug, []);
    by.get(slug).push({
      date: row.date,
      label: row.label || '',
      programs: (row.fmwa_programs || []).map((p) => ({
        start: p.start_time,
        title: p.title,
        note: p.note || ''
      }))
    });
  }
  return by;
}
```

- [ ] **Step 2: Add the hook**

Append to `src/data/events.js`:

```js
// Timetables are live-only — nothing ships in the bundle, so the section
// simply does not render offline or before Supabase answers.
let liveTT = null;
let pendingTT = null;

export function useTimetable() {
  const [timetable, setTimetable] = useState(liveTT || new Map());
  const [ready, setReady] = useState(Boolean(liveTT));
  useEffect(() => {
    if (liveTT) return;
    pendingTT = pendingTT || fetchTimetable().catch(() => null);
    let alive = true;
    pendingTT.then((r) => {
      if (r) liveTT = r;
      if (alive) {
        if (liveTT) setTimetable(liveTT);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { timetable, ready };
}
```

Change the import on line 2 of that file from `import { fetchEvents } from '../lib/sb.js';` to:

```js
import { fetchEvents, fetchTimetable } from '../lib/sb.js';
```

- [ ] **Step 3: Write the component**

Create `src/designs/a/Timetable.jsx`:

```jsx
import { Fragment } from 'react';
import { clock, dayLabel } from '../../data/schedule.js';

// Renders nothing at all when there is no published schedule, which is also
// what happens offline and before Supabase answers.
export default function Timetable({ days, title }) {
  if (!days || !days.length) return null;

  return (
    <section className="a-tt">
      <div className="a-tt-in">
        <div className="a-tt-h">
          <h2>{title}</h2>
          <p>Timings as scheduled by the festival committee.</p>
        </div>
        <div className="a-tt-scroll">
          <table className="a-tt-t">
            <tbody>
              {days.map((d) => (
                <Fragment key={d.date}>
                  <tr className="a-tt-day">
                    <th colSpan={2} scope="colgroup">
                      <span>{dayLabel(d.date)}</span>
                      {d.label && <i>{d.label}</i>}
                    </th>
                  </tr>
                  {d.programs.length === 0 && (
                    <tr>
                      <td className="a-tt-when" />
                      <td className="a-tt-what">
                        <i>Programme to be announced.</i>
                      </td>
                    </tr>
                  )}
                  {d.programs.map((p, i) => (
                    <tr key={`${d.date}-${i}`}>
                      <td className="a-tt-when">{clock(p.start)}</td>
                      <td className="a-tt-what">
                        <b>{p.title}</b>
                        {p.note && <i>{p.note}</i>}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire it into the home page**

In `src/designs/a/Home.jsx`, change the imports at the top to add:

```jsx
import { useEvents, useTimetable } from '../../data/events.js';
import { currentEvent, today } from '../../data/schedule.js';
import Timetable from './Timetable.jsx';
```

(The existing line is `import { useEvents } from '../../data/events.js';` — replace it with the first of those three.)

Inside `Home()`, replace `const { events } = useEvents();` with:

```jsx
const { events } = useEvents();
const { timetable } = useTimetable();
const dated = events.map((e) => ({ ...e, days: timetable.get(e.slug) || [] }));
const now = currentEvent(dated, today());
```

Then insert the section immediately after the closing `</section>` of `a-about` and before the `a-fc` section:

```jsx
      {now && <Timetable days={now.days} title={`${now.title} — Programme`} />}
```

- [ ] **Step 5: Wire it into the event page**

In `src/designs/a/Event.jsx`, change the import on line 2 to:

```jsx
import { useEvents, useTimetable } from '../../data/events.js';
```

and add:

```jsx
import Timetable from './Timetable.jsx';
```

Inside `Event()`, after `const { events, ready } = useEvents();` add:

```jsx
  const { timetable } = useTimetable();
```

Then insert immediately before the `<section className="a-eg">` line:

```jsx
      <Timetable days={timetable.get(ev.slug)} title="Programme" />
```

- [ ] **Step 6: Style it**

Append to `src/designs/a/style.css`, immediately before the `/* festivals */` comment:

```css
/* timetable */
.a-tt {
  background: var(--paper);
}
.a-tt-in {
  max-width: 1320px;
  margin-inline: auto;
  padding: clamp(30px, 3.6vw, 48px) clamp(16px, 4vw, 48px) clamp(40px, 5vw, 66px);
}
.a-tt-h { margin-bottom: clamp(18px, 2.4vw, 26px); }
.a-tt-h h2 { font-size: clamp(28px, 4.2vw, 46px); color: var(--maroon, var(--terra)); }
.a-tt-h p { color: var(--dim); font-size: 15px; font-style: italic; margin-top: 8px; }
.a-tt-scroll { overflow-x: auto; }
.a-tt-t {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.a-tt-day th {
  padding: clamp(18px, 2vw, 26px) 0 10px;
  border-bottom: 1px solid var(--line);
  font-weight: 400;
}
.a-tt-day span {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: clamp(21px, 2.4vw, 27px);
}
.a-tt-day i {
  font-style: normal;
  margin-left: 12px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--terra);
}
.a-tt-t tr + tr .a-tt-when,
.a-tt-t tr + tr .a-tt-what { border-top: 1px solid rgba(36, 27, 18, 0.08); }
.a-tt-when {
  width: 1%;
  white-space: nowrap;
  padding: 13px 24px 13px 0;
  vertical-align: baseline;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 20px;
  color: var(--terra);
}
.a-tt-what { padding: 13px 0; }
.a-tt-what b { font-weight: 500; display: block; }
.a-tt-what i { font-style: italic; color: var(--dim); font-size: 14.5px; }
```

- [ ] **Step 7: Verify in the browser**

Publish the event in Studio:

```sql
update public.fmwa_events set timetable_published = true where slug = 'ganesh-chaturthi';
```

Then:

```bash
npm run dev
```

Open `http://localhost:5173/`. Expected: a "Ganesh Chaturthi — Programme" section between About and the festival committee, showing `Tue, 15 Sep / Day 1 — Sthapana` and a `6:30 AM  Suprabhatam & Abhishekam  at the pandal` row. Open `http://localhost:5173/event/ganesh-chaturthi` and confirm the same table appears above the gallery. Check `http://localhost:5173/event/krishnashtami` shows **no** timetable section.

Now unpublish and hard-reload:

```sql
update public.fmwa_events set timetable_published = false where slug = 'ganesh-chaturthi';
```

Expected: the section disappears from both pages.

- [ ] **Step 8: Commit**

```bash
npx prettier --single-quote --print-width 100 --trailing-comma none --write src/designs/a/Timetable.jsx src/designs/a/Home.jsx src/designs/a/Event.jsx src/data/events.js src/lib/sb.js
npm run check && npx vite build
git add src/ 
git commit -m "Public timetable on the home and event pages"
```

---

### Task 4: Auth, admin shell and login

Adds the one new dependency and the `/admin` route, lazy-loaded so the public bundle is unchanged. Independently verifiable: both users can sign in and see a shell that reflects their role.

**Files:**
- Modify: `package.json` (add `@supabase/supabase-js`)
- Create: `src/lib/auth.js`
- Create: `src/admin/Admin.jsx`
- Create: `src/admin/Login.jsx`
- Create: `src/admin/style.css`
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: `SB` from `src/lib/sb.js`.
- Produces:
  - `sb` — the configured `SupabaseClient` (admin chunk only)
  - `ADMIN = 'fmwa_admin'`, `COMMITTEE = 'fmwa_committee'`
  - `roleOf(session) -> 'fmwa_admin' | 'fmwa_committee' | null`
  - `useSession() -> { session, role, userId, ready }`
  - `signIn(email, password) -> Promise<{ error }>`, `signOut() -> Promise<void>`

- [ ] **Step 1: Install the dependency**

```bash
npm install @supabase/supabase-js@^2.45.0
```

- [ ] **Step 2: Write the auth module**

Create `src/lib/auth.js`:

```js
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SB } from './sb.js';

// Admin-only client. The public site keeps its plain fetch in sb.js; this is
// the one place that needs session persistence and access-token refresh, and
// it only ever loads inside the lazy /admin chunk.
export const sb = createClient(SB.url, SB.key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fmwa-admin' }
});

export const ADMIN = 'fmwa_admin';
export const COMMITTEE = 'fmwa_committee';

// The Postgres role PostgREST switches into lives in the JWT's `role` claim,
// and that same claim is what RLS keys off. Read it from the token rather than
// from anything the client is free to edit.
export function roleOf(session) {
  if (!session?.access_token) return null;
  try {
    const [, payload] = session.access_token.split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).role || null;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, role: roleOf(session), userId: session?.user?.id || null, ready };
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signOut() {
  await sb.auth.signOut();
}
```

- [ ] **Step 3: Write the login screen**

Create `src/admin/Login.jsx`:

```jsx
import { useState } from 'react';
import { signIn } from '../lib/auth.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    // Deliberately vague: a precise message tells an attacker which half was
    // right. The committee only ever has one account each anyway.
    if (error) setErr('That email and password did not match.');
  }

  return (
    <div className="ad-login">
      <form className="ad-card" onSubmit={submit}>
        <h1>Fortune Meadows</h1>
        <p>Committee sign in</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {err && <p className="ad-err">{err}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write the shell**

Create `src/admin/Admin.jsx`. The `Users` route is added in Task 6; until then it renders the placeholder shown here.

```jsx
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ADMIN, COMMITTEE, signOut, useSession } from '../lib/auth.js';
import Login from './Login.jsx';
import './style.css';

export default function Admin() {
  const { role, userId, ready } = useSession();

  if (!ready) return null;
  if (!role) return <Login />;
  // Signed in with a role this app knows nothing about — treat as no access
  // rather than guessing what they may see.
  if (role !== ADMIN && role !== COMMITTEE) {
    return (
      <div className="ad-login">
        <div className="ad-card">
          <h1>No access</h1>
          <p>This account is not set up for the committee area.</p>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ad">
      <header className="ad-head">
        <b>Fortune Meadows</b>
        <nav>
          <Link to="/admin">Events</Link>
          {role === ADMIN && <Link to="/admin/users">Users</Link>}
          <a href="/">View site</a>
        </nav>
        <span className="ad-who">{role === ADMIN ? 'Administrator' : 'Festival committee'}</span>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="ad-main">
        <Routes>
          <Route index element={<p>Event list arrives in Task 5.</p>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Style the admin area**

Create `src/admin/style.css`:

```css
/* The admin area is deliberately plain — it is a tool, not the public site. */
.ad,
.ad-login {
  --ad-ink: #241b12;
  --ad-dim: #6d6154;
  --ad-line: rgba(36, 27, 18, 0.18);
  --ad-terra: #c2542a;
  font-family: Karla, system-ui, sans-serif;
  color: var(--ad-ink);
  background: #f6f2ea;
  min-height: 100dvh;
}
.ad-login { display: grid; place-items: center; padding: 24px; }
.ad-card {
  background: #fff;
  border: 1px solid var(--ad-line);
  border-radius: 10px;
  padding: 28px;
  width: min(380px, 100%);
  display: grid;
  gap: 14px;
}
.ad-card h1 { font-size: 22px; margin: 0; }
.ad-card > p { margin: 0; color: var(--ad-dim); font-size: 14px; }
.ad-card label { display: grid; gap: 6px; font-size: 13px; color: var(--ad-dim); }
.ad input,
.ad-card input,
.ad select,
.ad textarea {
  font: inherit;
  color: var(--ad-ink);
  padding: 9px 11px;
  border: 1px solid var(--ad-line);
  border-radius: 7px;
  background: #fff;
  width: 100%;
}
.ad button,
.ad-card button {
  font: inherit;
  font-size: 14px;
  padding: 9px 16px;
  border: 1px solid var(--ad-terra);
  border-radius: 7px;
  background: var(--ad-terra);
  color: #fff;
  cursor: pointer;
}
.ad button[disabled] { opacity: 0.55; cursor: default; }
.ad .ad-ghost { background: none; color: var(--ad-ink); border-color: var(--ad-line); }
.ad-err { color: #a3281b; font-size: 13.5px; margin: 0; }
.ad-ok { color: #1d6b45; font-size: 13.5px; margin: 0; }

.ad-head {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 14px clamp(16px, 4vw, 32px);
  border-bottom: 1px solid var(--ad-line);
  background: #fff;
}
.ad-head nav { display: flex; gap: 14px; }
.ad-head a { color: var(--ad-ink); font-size: 14px; }
.ad-who { margin-left: auto; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ad-dim); }
.ad-main { padding: clamp(18px, 3vw, 32px); max-width: 1100px; }
.ad-main h2 { font-size: 20px; margin: 0 0 14px; }
.ad-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid var(--ad-line);
}
.ad-grid { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin: 16px 0; }
.ad-grid label { display: grid; gap: 5px; font-size: 12px; color: var(--ad-dim); }
```

- [ ] **Step 6: Add the lazy route**

In `src/main.jsx`, change the React import on line 1 to:

```jsx
import React, { Suspense, lazy, useEffect } from 'react';
```

Add after the other imports:

```jsx
// Code-split: the public site ships none of the admin area or supabase-js.
const Admin = lazy(() => import('./admin/Admin.jsx'));
```

Add this route immediately before the `<Route path="/b" ...>` line:

```jsx
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
```

- [ ] **Step 7: Verify both roles sign in, and the split held**

```bash
npx vite build
```

Expected: the build output lists an extra JS chunk beyond `index-*.js`, and `index-*.js` has not grown by the ~120 kB that supabase-js would add. If supabase-js landed in the main chunk, the lazy import is wrong — fix it before continuing.

```bash
npm run dev
```

Open `http://localhost:5173/admin`.
1. Sign in as `admin@fortunemeadows.local`. Expected: header shows `Administrator` and both `Events` and `Users` links.
2. Sign out, sign in as `committee@fortunemeadows.local`. Expected: header shows `Festival committee` and **no** `Users` link.
3. Enter a wrong password. Expected: "That email and password did not match."
4. Reload the page while signed in. Expected: still signed in.

- [ ] **Step 8: Commit**

```bash
npx prettier --single-quote --print-width 100 --trailing-comma none --write src/lib/auth.js src/admin/Admin.jsx src/admin/Login.jsx src/main.jsx
git add package.json package-lock.json src/
git commit -m "Admin shell, login and role-aware navigation"
```

---

### Task 5: Committee timetable editor

The heart of the feature. A committee user sees only their assigned events, edits days and programs, and flips publish.

**Files:**
- Create: `src/data/timetable.js`
- Create: `src/admin/Timetable.jsx`
- Create: `src/admin/EventList.jsx`
- Modify: `src/admin/Admin.jsx` (replace the Task 4 placeholder route)

**Interfaces:**
- Consumes: `sb`, `ADMIN` from `src/lib/auth.js`; `clock`, `dayLabel` from `src/data/schedule.js`.
- Produces, all from `src/data/timetable.js`:
  - `listEvents(isAdmin, userId) -> Promise<[{ id, slug, title, timetable_published }]>`
  - `listDays(eventId) -> Promise<[{ id, date, label, fmwa_programs: [{ id, start_time, title, note, sort }] }]>`
  - `addDay(eventId, date, label) -> Promise<void>`
  - `removeDay(id) -> Promise<void>`
  - `addProgram(dayId, startTime, title, note) -> Promise<void>`
  - `removeProgram(id) -> Promise<void>`
  - `setPublished(eventId, on) -> Promise<void>`

- [ ] **Step 1: Write the data layer**

Create `src/data/timetable.js`:

```js
import { sb } from '../lib/auth.js';

// Every call here runs as the signed-in user's Postgres role, so RLS decides
// what comes back. A write that touches nothing is a permission failure, not
// an empty success — `.select()` on each mutation is what makes that visible.
const rows = (res) => {
  if (res.error) throw new Error(res.error.message);
  return res.data || [];
};

const touched = (res) => {
  if (res.error) throw new Error(res.error.message);
  if (!res.data || !res.data.length) {
    throw new Error('You do not have access to that event.');
  }
};

export async function listEvents(isAdmin, userId) {
  if (isAdmin) {
    return rows(
      await sb.from('fmwa_events').select('id,slug,title,timetable_published').order('sort')
    );
  }
  const assigned = rows(
    await sb
      .from('fmwa_event_editors')
      .select('fmwa_events(id,slug,title,timetable_published)')
      .eq('user_id', userId)
  );
  return assigned.map((r) => r.fmwa_events).filter(Boolean);
}

export async function listDays(eventId) {
  return rows(
    await sb
      .from('fmwa_event_days')
      .select('id,date,label,fmwa_programs(id,start_time,title,note,sort)')
      .eq('event_id', eventId)
      .order('date', { ascending: true })
      .order('start_time', { referencedTable: 'fmwa_programs', ascending: true })
      .order('sort', { referencedTable: 'fmwa_programs', ascending: true })
  );
}

export async function addDay(eventId, date, label) {
  const res = await sb
    .from('fmwa_event_days')
    .insert({ event_id: eventId, date, label: label || null })
    .select();
  if (res.error) {
    // 23505 is the unique (event_id, date) constraint.
    if (res.error.code === '23505') throw new Error('That date is already on this timetable.');
    throw new Error(res.error.message);
  }
  touched(res);
}

export async function removeDay(id) {
  touched(await sb.from('fmwa_event_days').delete().eq('id', id).select());
}

export async function addProgram(dayId, startTime, title, note) {
  touched(
    await sb
      .from('fmwa_programs')
      .insert({ day_id: dayId, start_time: startTime, title, note: note || null })
      .select()
  );
}

export async function removeProgram(id) {
  touched(await sb.from('fmwa_programs').delete().eq('id', id).select());
}

export async function setPublished(eventId, on) {
  touched(
    await sb.from('fmwa_events').update({ timetable_published: on }).eq('id', eventId).select()
  );
}
```

- [ ] **Step 2: Write the event list**

Create `src/admin/EventList.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN, useSession } from '../lib/auth.js';
import { listEvents } from '../data/timetable.js';

export default function EventList() {
  const { role, userId } = useSession();
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!userId) return;
    listEvents(role === ADMIN, userId)
      .then(setEvents)
      .catch((e) => setErr(e.message));
  }, [role, userId]);

  return (
    <>
      <h2>Events</h2>
      {err && <p className="ad-err">{err}</p>}
      {!err && !events.length && <p>No events are assigned to you yet.</p>}
      {events.map((e) => (
        <div className="ad-row" key={e.id}>
          <Link to={`/admin/event/${e.id}`}>{e.title}</Link>
          <span className={e.timetable_published ? 'ad-ok' : 'ad-err'}>
            {e.timetable_published ? 'Published' : 'Draft'}
          </span>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Write the timetable editor**

Create `src/admin/Timetable.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ADMIN, useSession } from '../lib/auth.js';
import { clock, dayLabel } from '../data/schedule.js';
import {
  addDay,
  addProgram,
  listDays,
  listEvents,
  removeDay,
  removeProgram,
  setPublished
} from '../data/timetable.js';

function DayCard({ day, onChange, onError }) {
  const [start, setStart] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  async function add(e) {
    e.preventDefault();
    try {
      await addProgram(day.id, start, title.trim(), note.trim());
      setStart('');
      setTitle('');
      setNote('');
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  async function drop(id) {
    try {
      await removeProgram(id);
      onChange();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <section className="ad-day">
      <div className="ad-row">
        <b>{dayLabel(day.date)}</b>
        <span className="ad-dim">{day.label}</span>
        <button
          type="button"
          className="ad-ghost"
          onClick={async () => {
            try {
              await removeDay(day.id);
              onChange();
            } catch (err) {
              onError(err.message);
            }
          }}
        >
          Remove day
        </button>
      </div>

      {(day.fmwa_programs || []).map((p) => (
        <div className="ad-row" key={p.id}>
          <span>{clock(p.start_time)}</span>
          <b>{p.title}</b>
          <span className="ad-dim">{p.note}</span>
          <button type="button" className="ad-ghost" onClick={() => drop(p.id)}>
            Remove
          </button>
        </div>
      ))}

      <form className="ad-grid" onSubmit={add}>
        <label>
          Start
          <input type="time" value={start} required onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Programme
          <input
            value={title}
            required
            placeholder="Suprabhatam & Abhishekam"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Note
          <input value={note} placeholder="at the pandal" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit">Add programme</button>
      </form>
    </section>
  );
}

export default function Timetable() {
  const { id } = useParams();
  const eventId = Number(id);
  const { role, userId } = useSession();
  const [event, setEvent] = useState(null);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const all = await listEvents(role === ADMIN, userId);
      const mine = all.find((e) => e.id === eventId) || null;
      setEvent(mine);
      setDays(mine ? await listDays(eventId) : []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [eventId, role, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function newDay(e) {
    e.preventDefault();
    try {
      await addDay(eventId, date, label.trim());
      setDate('');
      setLabel('');
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  async function togglePublish() {
    try {
      await setPublished(eventId, !event.timetable_published);
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  if (!event) {
    return (
      <>
        <p className="ad-err">{err || 'That event is not assigned to you.'}</p>
        <Link to="/admin">Back to events</Link>
      </>
    );
  }

  return (
    <>
      <h2>{event.title}</h2>
      <div className="ad-row">
        <span className={event.timetable_published ? 'ad-ok' : 'ad-err'}>
          {event.timetable_published
            ? 'Published — residents can see this timetable.'
            : 'Draft — residents cannot see this timetable.'}
        </span>
        <button type="button" onClick={togglePublish}>
          {event.timetable_published ? 'Unpublish' : 'Publish'}
        </button>
      </div>

      {err && <p className="ad-err">{err}</p>}

      <form className="ad-grid" onSubmit={newDay}>
        <label>
          Date
          <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Label
          <input
            value={label}
            placeholder="Day 1 — Sthapana"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button type="submit">Add day</button>
      </form>

      {days.map((d) => (
        <DayCard key={d.id} day={d} onChange={load} onError={setErr} />
      ))}
      {!days.length && <p>No days yet. Add the first one above.</p>}
    </>
  );
}
```

- [ ] **Step 4: Add the day-card styles**

Append to `src/admin/style.css`:

```css
.ad-day {
  border: 1px solid var(--ad-line);
  border-radius: 9px;
  background: #fff;
  padding: 6px 16px 16px;
  margin-bottom: 16px;
}
.ad-day .ad-row:last-of-type { border-bottom: 0; }
.ad-dim { color: var(--ad-dim); font-size: 13.5px; }
```

- [ ] **Step 5: Replace the placeholder routes**

In `src/admin/Admin.jsx`, add these imports:

```jsx
import EventList from './EventList.jsx';
import Timetable from './Timetable.jsx';
```

and replace the `<Route index .../>` line with:

```jsx
          <Route index element={<EventList />} />
          <Route path="event/:id" element={<Timetable />} />
```

- [ ] **Step 6: Verify as the committee user**

```bash
npm run dev
```

Sign in at `http://localhost:5173/admin` as `committee@fortunemeadows.local`.

1. Expected: exactly one event, Ganesh Chaturthi, marked `Draft`.
2. Open it. Add a day `2026-09-16` labelled `Day 2 — Cultural evening`. Expected: it appears sorted after 15 Sep.
3. Add two programmes to that day, `18:00 Bhajans` and `19:30 Children's fancy dress`. Expected: both listed, 6:00 PM before 7:30 PM.
4. Add a day with the date `2026-09-15` again. Expected: "That date is already on this timetable." — not a raw constraint error.
5. Press Publish. Open `http://localhost:5173/` in another tab. Expected: the timetable section shows both days.
6. Press Unpublish and hard-reload the public tab. Expected: the section is gone.
7. Visit `http://localhost:5173/admin/event/<id of krishnashtami>` directly by typing the URL. Expected: "That event is not assigned to you." and no data.

- [ ] **Step 7: Verify as the admin user**

Sign out, sign in as `admin@fortunemeadows.local`. Expected: all three events listed, and opening any of them shows its editor.

- [ ] **Step 8: Commit**

```bash
npx prettier --single-quote --print-width 100 --trailing-comma none --write src/data/timetable.js src/admin/Timetable.jsx src/admin/EventList.jsx src/admin/Admin.jsx
npm run check && npx vite build
git add src/
git commit -m "Committee timetable editor with publish switch"
```

---

### Task 6: User management

The one privileged endpoint and the admin screen that drives it. Replaces the hand-made user from Task 1.

**Files:**
- Create: `api/users.js`
- Create: `src/admin/Users.jsx`
- Modify: `src/admin/Admin.jsx` (add the `/admin/users` route)
- Modify: `README.md` (document the two Vercel environment variables)

**Interfaces:**
- Consumes: `sb`, `ADMIN`, `COMMITTEE`, `useSession` from `src/lib/auth.js`; `listEvents` from `src/data/timetable.js`.
- Produces: `GET|POST|DELETE /api/users`.
  - `GET` → `200 [{ id, email, role, created_at }]`
  - `POST {email, password, role}` → `201 { id, email, role }`
  - `DELETE /api/users?id=<uuid>` → `204`
  - `401` no/invalid token, `403` caller is not `fmwa_admin`, `400` invalid body.

- [ ] **Step 1: Write the serverless function**

Create `api/users.js`:

```js
// The only code in this project that holds the service-role key, and the only
// reason it exists: creating a Supabase user cannot be done from the browser.
//
// Every request is rejected unless the caller's own JWT resolves to a user
// whose role is fmwa_admin. That check runs before the body is read.
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROLES = ['fmwa_admin', 'fmwa_committee'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const admin = (path, init = {}) =>
  fetch(`${URL}/auth/v1/admin/users${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

async function caller(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${token}` }
  });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  if (!URL || !SERVICE) return res.status(500).json({ error: 'Server is not configured.' });

  const me = await caller(req);
  if (!me) return res.status(401).json({ error: 'Sign in first.' });
  if (me.role !== 'fmwa_admin') return res.status(403).json({ error: 'Administrators only.' });

  if (req.method === 'GET') {
    const r = await admin('');
    if (!r.ok) return res.status(502).json({ error: 'Could not list users.' });
    const { users = [] } = await r.json();
    return res.status(200).json(
      users.map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }))
    );
  }

  if (req.method === 'POST') {
    const { email, password, role } = req.body || {};
    if (!EMAIL.test(String(email || ''))) {
      return res.status(400).json({ error: 'That email address does not look right.' });
    }
    if (String(password || '').length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Unknown role.' });
    }
    const r = await admin('', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, email_confirm: true })
    });
    const body = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: body.msg || body.message || 'Could not create user.' });
    }
    return res.status(201).json({ id: body.id, email: body.email, role: body.role });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (id === me.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const r = await admin(`/${id}`, { method: 'DELETE' });
    if (!r.ok) return res.status(502).json({ error: 'Could not delete user.' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).end();
}
```

- [ ] **Step 2: Set the environment variables**

```bash
npx vercel env add SUPABASE_URL production
# paste: https://uuzexivlzoxszmnrpryr.supabase.co
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
# paste the service_role key from Supabase Studio → Settings → API
```

Repeat both for the `development` and `preview` environments, then `npx vercel env pull .env.local` so `vercel dev` can see them. Confirm `.env.local` is gitignored — if it is not, add it to `.gitignore` in this step.

- [ ] **Step 3: Write the users screen**

Create `src/admin/Users.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react';
import { ADMIN, COMMITTEE, sb, useSession } from '../lib/auth.js';
import { listEvents } from '../data/timetable.js';

async function call(token, method, body, query = '') {
  const r = await fetch(`/api/users${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function Assignments({ user, events, onError }) {
  const [mine, setMine] = useState([]);

  const load = useCallback(async () => {
    const { data, error } = await sb
      .from('fmwa_event_editors')
      .select('event_id')
      .eq('user_id', user.id);
    if (error) return onError(error.message);
    setMine(data.map((r) => r.event_id));
  }, [user.id, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(eventId, on) {
    const q = on
      ? sb.from('fmwa_event_editors').insert({ user_id: user.id, event_id: eventId })
      : sb.from('fmwa_event_editors').delete().eq('user_id', user.id).eq('event_id', eventId);
    const { error } = await q;
    if (error) return onError(error.message);
    load();
  }

  return (
    <div className="ad-grid">
      {events.map((e) => (
        <label key={e.id} className="ad-check">
          <input
            type="checkbox"
            checked={mine.includes(e.id)}
            onChange={(ev) => toggle(e.id, ev.target.checked)}
          />
          {e.title}
        </label>
      ))}
    </div>
  );
}

export default function Users() {
  const { session, userId } = useSession();
  const token = session?.access_token;
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(COMMITTEE);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setUsers(await call(token, 'GET'));
      setEvents(await listEvents(true, userId));
    } catch (e) {
      setErr(e.message);
    }
  }, [token, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    try {
      await call(token, 'POST', { email: email.trim(), password, role });
      setOk(`${email.trim()} created.`);
      setEmail('');
      setPassword('');
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  async function drop(id) {
    setErr('');
    try {
      await call(token, 'DELETE', null, `?id=${encodeURIComponent(id)}`);
      load();
    } catch (error) {
      setErr(error.message);
    }
  }

  return (
    <>
      <h2>Users</h2>

      <form className="ad-grid" onSubmit={create}>
        <label>
          Email
          <input
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            required
            minLength={10}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value={COMMITTEE}>Festival committee</option>
            <option value={ADMIN}>Administrator</option>
          </select>
        </label>
        <button type="submit">Create user</button>
      </form>

      {err && <p className="ad-err">{err}</p>}
      {ok && <p className="ad-ok">{ok}</p>}

      {users.map((u) => (
        <section className="ad-day" key={u.id}>
          <div className="ad-row">
            <b>{u.email}</b>
            <span className="ad-dim">
              {u.role === ADMIN ? 'Administrator' : 'Festival committee'}
            </span>
            {u.id !== userId && (
              <button type="button" className="ad-ghost" onClick={() => drop(u.id)}>
                Delete
              </button>
            )}
          </div>
          {u.role === COMMITTEE && (
            <Assignments user={u} events={events} onError={setErr} />
          )}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Add the checkbox style and the route**

Append to `src/admin/style.css`:

```css
.ad-check {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  color: var(--ad-ink);
}
.ad-check input { width: auto; }
```

In `src/admin/Admin.jsx`, add the import:

```jsx
import Users from './Users.jsx';
```

and add this route after the `event/:id` route:

```jsx
          {role === ADMIN && <Route path="users" element={<Users />} />}
```

- [ ] **Step 5: Verify the endpoint refuses non-admins**

```bash
npx vercel dev
```

In another terminal, get a committee token (as in Task 1 Step 5) and:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/users
# expected: 401

curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN"
# expected: 403   ($TOKEN is the committee user's)
```

Both must hold before going further. A 200 from either means the guard is broken.

- [ ] **Step 6: Verify the screen**

With `vercel dev` running, sign in at `http://localhost:3000/admin` as the admin.

1. Open Users. Expected: both existing accounts listed with their roles.
2. Create `giri@fortunemeadows.local` with a 12-character password and role Festival committee. Expected: "created." and the user appears.
3. Try creating one with a 6-character password. Expected: "Password must be at least 10 characters."
4. Tick Krishnashtami for the new user. Sign out, sign in as that user. Expected: Krishnashtami is the only event listed, and its timetable editor works.
5. Sign back in as admin and confirm no Delete button appears on your own row.

- [ ] **Step 7: Document the environment variables**

In `README.md`, add a new section immediately before `## Deploy`:

```markdown
## Admin

`/admin` is a lazy-loaded chunk — the public bundle contains none of it.
Sign-in is Supabase email/password; the Postgres role in the JWT (`fmwa_admin`
or `fmwa_committee`) decides what the account can do, and RLS enforces it.

`api/users.js` is the only server-side code, and exists only because creating a
Supabase user needs the service-role key. It requires two Vercel environment
variables, set for production, preview and development:

    SUPABASE_URL                 https://uuzexivlzoxszmnrpryr.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    Studio → Settings → API → service_role

Never put the service-role key anywhere under `src/` — it would ship to every
visitor. Run the admin area locally with `npx vercel dev` (not `npm run dev`),
which is what serves `/api`.
```

- [ ] **Step 8: Commit**

```bash
npx prettier --single-quote --print-width 100 --trailing-comma none --write src/admin/Users.jsx src/admin/Admin.jsx api/users.js
npm run check && npx vite build
git add api/ src/ README.md .gitignore
git commit -m "Admin user management with a scoped serverless endpoint"
```

- [ ] **Step 9: Deploy and verify in production**

```bash
git push origin main
npx vercel --prod --yes
```

Then against the production URL:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://fmwa.vercel.app/api/users
# expected: 401, NOT 200 and NOT the index.html page
```

A `200` with HTML means the `vercel.json` catch-all rewrite swallowed the
function; add `"has"`-free exclusion by changing the rewrite source to
`"/((?!api/).*)"` and redeploy. Finally sign in at
`https://fmwa.vercel.app/admin` and confirm the committee flow end to end.

---

## Plan self-review

**Spec coverage.** Success criterion 1 → Task 6. Criterion 2 → Tasks 4 and 5. Criterion 3 → Task 1 Steps 3-4 (anon reads return `[]` while unpublished). Criterion 4 → Task 3. Criterion 5 → Task 1 Step 5 and Task 5 Step 6.7, Task 6 Step 5. Data model → Task 1. Roles/grants/RLS → Task 1. Serverless function → Task 6. Application structure → Tasks 3-6. Public selection → Tasks 2 and 3. Error handling: Supabase unreachable → Task 3 Step 3 (component returns null); expired token → Task 4 (`autoRefreshToken`); zero-rows-as-permission-failure → Task 5 Step 1 (`touched`); 401/403 → Task 6 Step 1; duplicate day → Task 5 Step 1 (`23505`). Testing section → Task 2, plus the manual RLS steps named above.

**Deviation from the spec, deliberate.** The spec's file list named `src/data/timetable.js` for the admin side and `src/lib/sb.js` for the public read, but did not name a home for the public hook or the admin event list. `useTimetable` goes in `src/data/events.js` next to `useEvents` rather than in a new file, and `src/admin/EventList.jsx` is split out of `Admin.jsx` to keep the shell small. Neither changes any interface in the spec.

**Type consistency.** `Day` is `{ date, label, programs: [{ start, title, note }] }` on the public side — the shape `fetchTimetable` builds and `Timetable.jsx` consumes. The admin side deliberately keeps the raw PostgREST shape (`start_time`, `fmwa_programs`) because it writes back to those columns; `src/admin/Timetable.jsx` is the only consumer and reads `p.start_time`. `listEvents(isAdmin, userId)` takes a boolean first, and both call sites pass `role === ADMIN` or `true`. `currentEvent` requires each event to carry `days`, which is why Task 3 Step 4 maps `events` into `dated` before calling it.
