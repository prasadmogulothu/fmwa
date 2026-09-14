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
