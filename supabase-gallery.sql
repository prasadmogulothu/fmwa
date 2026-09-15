-- Fortune Meadows — event gallery uploads (piece D).
-- Supabase Studio → SQL Editor. Safe to re-run.
--
-- Run supabase-setup.sql and supabase-timetable.sql first: this file assumes
-- fmwa_events, fmwa_photos, fmwa_programs, fmwa_event_days, fmwa_admin and
-- fmwa_committee already exist.
--
-- Three things:
--   1. a settings row the admin edits from /admin/settings
--   2. one optional image per timetable row
--   3. committee write access to their own events' photo galleries
--   4. a year on each gallery photo, so 2025's Ganesh photos and 2026's sit
--      under the same festival without duplicate event rows
--
-- STEP 1  run this whole file
-- STEP 2  verify the new columns and the settings row exist:
--   select key, value from public.fmwa_settings;
--   select image_url from public.fmwa_programs limit 1;
--   select year from public.fmwa_photos limit 1;

-- ---------------------------------------------------- upload settings
-- Key/value so the next setting does not need a migration. Today there is
-- exactly one row, key = 'upload'.
--
--   max_bytes    hard ceiling, enforced server-side in api/upload.js
--   max_edge_px  long edge the browser resizes down to before uploading
--   quality      JPEG quality for that re-encode
create table if not exists public.fmwa_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ponytail: no CHECK constraint on the ranges. api/upload.js clamps max_bytes
-- against Vercel's 4.5 MB body cap, which is a platform fact the database has
-- no way to know, and /admin/settings validates on the way in. Add a
-- constraint here if settings ever get written by something other than those
-- two paths.
insert into public.fmwa_settings (key, value) values
  ('upload', '{"max_bytes": 2097152, "max_edge_px": 1600, "quality": 0.82}')
on conflict (key) do nothing;

alter table public.fmwa_settings enable row level security;

-- Strip the blanket grants Supabase hands every table in `public`. Only the
-- two signed-in roles read this: the picker lives in the lazy /admin chunk
-- behind the role gate, so anon never needs the limits.
revoke all on public.fmwa_settings from anon, authenticated;
grant select on public.fmwa_settings to fmwa_committee;
grant select, insert, update, delete on public.fmwa_settings to fmwa_admin;

drop policy if exists fmwa_settings_committee_read on public.fmwa_settings;
create policy fmwa_settings_committee_read on public.fmwa_settings
  for select to fmwa_committee using (true);

drop policy if exists fmwa_settings_admin_all on public.fmwa_settings;
create policy fmwa_settings_admin_all on public.fmwa_settings
  for all to fmwa_admin using (true) with check (true);

-- -------------------------------------------- one image per timetable row
-- A column, not a child table: the ask is exactly one image per programme,
-- and a column inherits the row's RLS for free. Because the image rides on
-- the programme row, the existing timetable_published filter already hides it
-- until the committee publishes — no extra policy, no extra code.
alter table public.fmwa_programs   add column if not exists image_url text;
alter table public.fmwa_event_days add column if not exists image_url text;

-- No new policy and no new grant for those two columns. The grants in
-- supabase-timetable.sql are table-level (`grant select on
-- public.fmwa_programs to anon`, not a column list), and a table-level grant
-- covers columns added later. So anon reads image_url on published rows only,
-- committee writes it on their assigned events only, admin writes it
-- anywhere — all of that already holds.
--
-- The one column-level grant in this schema is on fmwa_events
-- (`grant update (timetable_published) to fmwa_committee`) and nothing here
-- adds a column there. Leave it that way: adding one would silently be
-- unwritable by committee users.

-- ------------------------------------------ committee gallery uploads
-- fmwa_photos was admin-write. A committee member may now manage the gallery
-- of an event assigned to them in fmwa_event_editors, and no other.
--
-- NOTE: fmwa_photos has no publish gate — fmwa_events_public_read is
-- `using (true)` and only timetables carry timetable_published. So a gallery
-- photo is visible to residents the moment it is uploaded, unlike the
-- per-programme image_url above. That is the pre-existing behaviour of the
-- gallery, not something this file changes; if gallery photos should also
-- wait for a switch, that needs its own flag and is not in piece D.
grant select, insert, update, delete on public.fmwa_photos to fmwa_committee;

drop policy if exists fmwa_photos_committee_all on public.fmwa_photos;
create policy fmwa_photos_committee_all on public.fmwa_photos
  for all to fmwa_committee
  using (event_id in (select event_id from public.fmwa_event_editors
                       where user_id = auth.uid()))
  with check (event_id in (select event_id from public.fmwa_event_editors
                            where user_id = auth.uid()));

-- ------------------------------------------------- a year per gallery photo
-- One festival is one fmwa_events row forever: "Ganesh Chaturthi" is the
-- event, 2025 and 2026 are instances of it. The instance year belongs on the
-- things that actually differ year to year, which is the photos — so this is
-- a column on fmwa_photos, not a second event row and not a column on
-- fmwa_events.
--
-- Timetables already have this and need no change: fmwa_event_days.date is a
-- real date with `unique (event_id, date)`, so a 2025 timetable and a 2026
-- one already coexist under one event. The public page groups them by
-- extract(year from date) rather than by a stored column.
--
-- Default is the current year, so an upload during the festival lands in the
-- right place without the committee having to think about it. The migration
-- of the bundled public/assets photos inserts explicit years instead.
alter table public.fmwa_photos
  add column if not exists year int not null default extract(year from now())::int;

-- ponytail: no index on (event_id, year). fmwa_photos_event_idx already
-- exists and this table holds a few dozen rows for a colony gallery — a
-- second index would cost more to maintain than the sort it saves. Add one if
-- the gallery ever runs to thousands of photos.
