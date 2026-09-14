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
