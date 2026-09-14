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
