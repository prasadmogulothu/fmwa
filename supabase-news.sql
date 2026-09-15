-- Fortune Meadows — the noticeboard.
-- Supabase Studio → SQL Editor. Safe to re-run.
--
-- Run supabase-setup.sql and supabase-timetable.sql first: this file assumes
-- fmwa_admin and fmwa_committee already exist.
--
-- Two tables: the posts, and who may write them.
--
-- Access works the same way event timetables do. There is no third Postgres
-- role — a news writer is an ordinary fmwa_committee user with a row in
-- fmwa_news_editors, exactly as an event editor is one with a row in
-- fmwa_event_editors. That keeps the role list at two and means the admin
-- grants news access with a checkbox rather than by reassigning a role.
--
-- A user may therefore hold any combination: events only, news only, or both.
-- Someone with news and no events sees an empty Events screen, which is
-- correct — they have not been given any.
--
-- STEP 1  run this whole file
-- STEP 2  verify as anon (should return [] until something is published):
--   select id, date, title from public.fmwa_news;

-- ------------------------------------------------------------- tables
create table if not exists public.fmwa_news (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- The date the announcement is *about*, which the writer can change; not
  -- created_at. Defaults to the server's date only as a backstop — the admin
  -- form fills it with the browser's local date, because current_date here is
  -- UTC and would read as yesterday for an evening post in India.
  date       date    not null default current_date,
  title      text    not null,
  body       text,
  published  boolean not null default false
);
-- The public page reads newest first and nothing else, so this is the only
-- ordering worth an index.
create index if not exists fmwa_news_date_idx on public.fmwa_news (date desc, id desc);

-- One row per user who may write news. No columns beyond the id: this is a
-- yes/no capability, unlike fmwa_event_editors which scopes to a single event.
create table if not exists public.fmwa_news_editors (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- grants
grant select, insert, update, delete on public.fmwa_news to fmwa_admin, fmwa_committee;
grant select, insert, update, delete on public.fmwa_news_editors to fmwa_admin;
grant select on public.fmwa_news_editors to fmwa_committee;

-- ----------------------------------------------------------------- RLS
alter table public.fmwa_news         enable row level security;
alter table public.fmwa_news_editors enable row level security;

-- Strip the blanket grants Supabase hands every table in `public`, then give
-- anon read-only access to the posts. Who may write them is private.
revoke all on public.fmwa_news, public.fmwa_news_editors from anon, authenticated;
grant select on public.fmwa_news to anon;

-- public: published posts only. An unpublished draft is invisible to anon at
-- the database, not merely filtered in the query.
drop policy if exists fmwa_news_public_read on public.fmwa_news;
create policy fmwa_news_public_read on public.fmwa_news
  for select to anon using (published);

-- admin: everything
drop policy if exists fmwa_news_admin_all on public.fmwa_news;
create policy fmwa_news_admin_all on public.fmwa_news
  for all to fmwa_admin using (true) with check (true);

-- committee: only those the admin has added to fmwa_news_editors. The grant
-- above is table-wide for fmwa_committee, so this policy is what actually
-- separates a news writer from an ordinary committee member.
drop policy if exists fmwa_news_committee_all on public.fmwa_news;
create policy fmwa_news_committee_all on public.fmwa_news
  for all to fmwa_committee
  using (exists (select 1 from public.fmwa_news_editors where user_id = auth.uid()))
  with check (exists (select 1 from public.fmwa_news_editors where user_id = auth.uid()));

-- A committee user may read their own assignment, so the admin UI can show
-- whether they have news access and the app can show or hide the News link.
-- They cannot see anyone else's, and cannot grant themselves access.
drop policy if exists fmwa_news_editors_own on public.fmwa_news_editors;
create policy fmwa_news_editors_own on public.fmwa_news_editors
  for select to fmwa_committee using (user_id = auth.uid());

drop policy if exists fmwa_news_editors_admin_all on public.fmwa_news_editors;
create policy fmwa_news_editors_admin_all on public.fmwa_news_editors
  for all to fmwa_admin using (true) with check (true);

-- Note: fmwa_committee already has `grant usage on schema auth` from
-- supabase-timetable.sql, which the auth.uid() calls above need. The role is
-- noinherit, so without it every policy here would fail at runtime with a
-- permission error rather than simply returning no rows.
