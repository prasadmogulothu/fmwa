// ponytail: plain fetch against the Supabase REST API. Two read calls on a
// public site don't need the client library. Same project as the other
// HHAppSolutions sites; every table here is prefixed fmwa_.
const SB_URL = 'https://uuzexivlzoxszmnrpryr.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1emV4aXZsem94c3ptbnJwcnlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDIxMzksImV4cCI6MjEwMzIxODEzOX0.33Tg5KccbVOcAir7XqkeZSaPVorvopCrOw2R6YYSZnM';

export const SB = { url: SB_URL, key: SB_KEY };
export const HEAD = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

// One request: events with their photos embedded, newest committee ordering first.
const SELECT =
  'select=slug,title,telugu,when_text,line,blurb,accent,cover,fmwa_photos(url,sort)&order=sort.asc&fmwa_photos.order=sort.asc';

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
    photos: (e.fmwa_photos || []).map((p) => p.url)
  }));
}
