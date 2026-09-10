-- Fortune Meadows Welfare Association — Supabase Studio → SQL Editor.
-- Safe to re-run.
--
-- Same Supabase project as the other HHAppSolutions sites, so everything here
-- is prefixed fmwa_ and the admin runs as its own Postgres role, fmwa_admin,
-- granted on fmwa_* tables and nothing else. That boundary sits one layer below
-- RLS, so it holds regardless of how permissive another site's policies are.
--
-- STEP 1  run this whole file
-- STEP 2  Authentication → Users → Add user
--           email admin@fortunemeadows.local
--           password of your choosing, Auto Confirm User ON
-- STEP 3  run the UPDATE at the very bottom (needs the user to exist first)

-- ------------------------------------------------------------- tables
create table if not exists public.fmwa_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  slug       text not null unique,
  title      text not null,
  telugu     text,
  when_text  text,            -- '15 August', 'Sravana masam'
  line       text,            -- one-line description on the card
  blurb      text,
  accent     text not null default '#c2542a',
  cover      text,            -- URL of a photo from the event
  thumb      text,            -- URL of the festival illustration used as the thumbnail
  sort       int  not null default 0
);

create table if not exists public.fmwa_photos (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_id   bigint not null references public.fmwa_events(id) on delete cascade,
  url        text not null,
  caption    text,
  sort       int not null default 0
);
alter table public.fmwa_events add column if not exists thumb text;
create index if not exists fmwa_photos_event_idx on public.fmwa_photos (event_id, sort);

-- -------------------------------------------------- the scoped role
-- NOLOGIN: only ever reached by PostgREST switching into it, and deliberately
-- not granted `authenticated`, so it inherits nothing.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'fmwa_admin') then
    create role fmwa_admin nologin noinherit;
  end if;
end $$;
grant fmwa_admin to authenticator;
grant usage on schema public to fmwa_admin;
grant select, insert, update, delete on public.fmwa_events, public.fmwa_photos to fmwa_admin;

-- --------------------------------------------------------------- RLS
alter table public.fmwa_events enable row level security;
alter table public.fmwa_photos enable row level security;

-- Strip the blanket grants Supabase hands every table in `public`, then give
-- anon read-only access: the site is public, the committee's edits are not.
revoke all on public.fmwa_events from anon, authenticated;
revoke all on public.fmwa_photos from anon, authenticated;
grant select on public.fmwa_events, public.fmwa_photos to anon;

drop policy if exists fmwa_events_public_read on public.fmwa_events;
create policy fmwa_events_public_read on public.fmwa_events
  for select to anon using (true);

drop policy if exists fmwa_photos_public_read on public.fmwa_photos;
create policy fmwa_photos_public_read on public.fmwa_photos
  for select to anon using (true);

drop policy if exists fmwa_events_admin_all on public.fmwa_events;
create policy fmwa_events_admin_all on public.fmwa_events
  for all to fmwa_admin using (true) with check (true);

drop policy if exists fmwa_photos_admin_all on public.fmwa_photos;
create policy fmwa_photos_admin_all on public.fmwa_photos
  for all to fmwa_admin using (true) with check (true);

-- ----------------------------------------------------------- storage
-- Gallery uploads live in one public bucket. Public read so <img src> works
-- straight off the CDN; writes are limited to fmwa_admin by the policies below.
insert into storage.buckets (id, name, public)
values ('fmwa', 'fmwa', true)
on conflict (id) do update set public = true;

drop policy if exists fmwa_storage_public_read on storage.objects;
create policy fmwa_storage_public_read on storage.objects
  for select to anon using (bucket_id = 'fmwa');

drop policy if exists fmwa_storage_admin_write on storage.objects;
create policy fmwa_storage_admin_write on storage.objects
  for all to fmwa_admin using (bucket_id = 'fmwa') with check (bucket_id = 'fmwa');

-- --------------------------------------------------------- seed rows
-- Matches the three festivals bundled in src/data/events.js. Photo rows are
-- left out on purpose: upload the real photos through admin, which writes both
-- the storage object and the fmwa_photos row.
insert into public.fmwa_events (slug, title, telugu, when_text, line, blurb, accent, cover, thumb, sort)
values
  ('independence-day', 'Independence Day', 'స్వాతంత్ర్య దినోత్సవం', '15 August',
   'Flag hoisting at the gate',
   'The committee and residents gather at the main gate before nine. The flag goes up, children sing, and sweets are handed out block by block before everyone leaves for the day.',
   '#c2542a', '/assets/id-1.jpeg', '/assets/thumb-independence-day.png', 1),
  ('krishnashtami', 'Krishnashtami', 'శ్రీ కృష్ణాష్టమి', 'Sravana masam',
   'Janmashtami Celebrations',
   'Little Krishnas in fancy dress through the morning, the uri strung up high in the afternoon, and bhajans until the pot finally breaks. Prasadam goes to every household.',
   '#1f5fa8', '/assets/krishnashtami-2.jpeg', '/assets/thumb-krishnashtami.png', 2),
  ('ganesh-chaturthi', 'Ganesh Chaturthi', 'వినాయక చవితి', 'Bhadrapada masam',
   'Nine days at the colony pandal',
   'Vinayaka is installed at the pandal on the first morning and stays nine days. Pooja twice a day, cultural evenings for the children, and an eco-friendly nimajjanam to close.',
   '#b8862b', '/assets/ganesh-1.jpeg', '/assets/thumb-ganesh-chaturthi.png', 3)
on conflict (slug) do nothing;

-- ============================ STEP 3 ============================
-- Run after creating the user in Studio. Must report "UPDATE 1".
-- This is what puts role=fmwa_admin in the admin's JWT.
update auth.users
   set role = 'fmwa_admin'
 where email = 'admin@fortunemeadows.local';
