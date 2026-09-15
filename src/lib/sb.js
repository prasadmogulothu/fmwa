// ponytail: plain fetch against the Supabase REST API. Two read calls on a
// public site don't need the client library. Same project as the other
// HHAppSolutions sites; every table here is prefixed fmwa_.
const SB_URL = 'https://uuzexivlzoxszmnrpryr.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1emV4aXZsem94c3ptbnJwcnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDIxMzksImV4cCI6MjEwMzIxODEzOX0.33Tg5KccbVOcAir7XqkeZSaPVorvopCrOw2R6YYSZnM';

export const SB = { url: SB_URL, key: SB_KEY };
export const HEAD = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

// One request: events with their photos embedded, newest committee ordering first.
// Photos come back newest year first, then in the committee's own order, so
// the gallery groups by year without sorting anything in the client.
const SELECT =
  'select=slug,title,telugu,when_text,line,blurb,accent,cover,thumb,fmwa_photos(url,year,sort)' +
  '&order=sort.asc&fmwa_photos.order=year.desc,sort.asc';

export async function fetchEvents() {
  const r = await fetch(`${SB_URL}/rest/v1/fmwa_events?${SELECT}`, { headers: HEAD });
  if (!r.ok) throw new Error('fmwa_events ' + r.status);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.map((e) => ({
    slug: e.slug,
    title: e.title,
    telugu: e.telugu || '',
    when: e.when_text || '',
    line: e.line || '',
    blurb: e.blurb || '',
    accent: e.accent || '#c2542a',
    cover: e.cover,
    thumb: e.thumb,
    photos: (e.fmwa_photos || []).map((p) => ({ url: p.url, year: p.year || null }))
  }));
}

// One request: every published day with its programs embedded and the parent
// event's slug alongside, ordered in the query rather than in the client.
// Unpublished rows are filtered by RLS, not here.
//
// Days run newest first; the programmes inside a day stay in their own running
// order, earliest start time first. The two orderings are deliberately
// opposite — you want the latest day at the top, but a single day still reads
// down the page as it happens. Admin keeps days ascending (see listDays in
// src/data/timetable.js), because editing a timetable is chronological work.
const TT_SELECT =
  'select=date,label,image_url,fmwa_events!inner(slug),' +
  'fmwa_programs(start_time,title,note,sort,image_url)' +
  '&order=date.desc&fmwa_programs.order=start_time.asc,sort.asc';

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
      image: row.image_url || null,
      programs: (row.fmwa_programs || []).map((p) => ({
        start: p.start_time,
        title: p.title,
        note: p.note || '',
        image: p.image_url || null
      }))
    });
  }
  return by;
}

// Published announcements, newest first. Drafts are invisible here because the
// RLS policy on fmwa_news restricts anon to published rows — not because of
// anything in this query.
const NEWS_SELECT = 'select=id,date,title,body&order=date.desc,id.desc';

export async function fetchNews() {
  const r = await fetch(`${SB_URL}/rest/v1/fmwa_news?${NEWS_SELECT}`, { headers: HEAD });
  if (!r.ok) throw new Error('fmwa_news ' + r.status);
  const rows = await r.json();
  return rows.map((n) => ({
    id: n.id,
    date: n.date,
    title: n.title,
    body: n.body || ''
  }));
}
