import { sb } from '../lib/auth.js';

// Noticeboard posts, read and written as the signed-in user's Postgres role.
// RLS decides what comes back: an admin sees everything, a committee member
// sees everything only if the admin put them in fmwa_news_editors, and anon
// sees published posts through src/lib/sb.js instead.
//
// Same convention as src/data/timetable.js: a write that touches nothing is a
// permission failure, not an empty success, which is what `.select()` on each
// mutation makes visible. A delete is the exception — zero rows there is just
// as often a row someone else already removed.
const rows = (res) => {
  if (res.error) throw new Error(res.error.message);
  return res.data || [];
};

const touched = (res) => {
  if (res.error) {
    // 42501 is a WITH CHECK violation: RLS never let the row exist, so there
    // is no zero-row result for the check below to catch.
    if (res.error.code === '42501') throw new Error('You do not have access to the noticeboard.');
    throw new Error(res.error.message);
  }
  if (!res.data || !res.data.length) {
    throw new Error('You do not have access to the noticeboard.');
  }
  return res.data;
};

// Whether the signed-in user may write news at all. An admin always may; a
// committee member may only if they have a row in fmwa_news_editors, and the
// RLS policy there returns their own row and nothing else. Used to decide
// whether the News link renders — the database decides whether it works.
export async function canWriteNews(isAdmin, userId) {
  if (isAdmin) return true;
  if (!userId) return false;
  const res = await sb.from('fmwa_news_editors').select('user_id').eq('user_id', userId);
  return !res.error && (res.data || []).length > 0;
}

// Newest first, matching the public page. Drafts are mixed in with published
// posts on purpose: the admin list is where you go to find the draft.
export async function listNews() {
  return rows(
    await sb
      .from('fmwa_news')
      .select('id,date,title,body,published')
      .order('date', { ascending: false })
      .order('id', { ascending: false })
  );
}

export async function addNews({ date, title, body, published = false }) {
  return touched(
    await sb
      .from('fmwa_news')
      .insert({ date, title, body: body || null, published })
      .select()
  )[0];
}

export async function updateNews(id, { date, title, body }) {
  touched(
    await sb
      .from('fmwa_news')
      .update({ date, title, body: body || null })
      .eq('id', id)
      .select()
  );
}

export async function setNewsPublished(id, published) {
  touched(await sb.from('fmwa_news').update({ published }).eq('id', id).select());
}

export async function removeNews(id) {
  const res = await sb.from('fmwa_news').delete().eq('id', id).select();
  if (res.error) throw new Error(res.error.message);
}

// --------------------------------------------------------------- assignment
// Admin only in practice — the RLS policy on fmwa_news_editors refuses a
// committee user's write, and these are only called from the Users screen.

export async function listNewsEditors() {
  return rows(await sb.from('fmwa_news_editors').select('user_id')).map((r) => r.user_id);
}

export async function setNewsEditor(userId, on) {
  const res = on
    ? await sb.from('fmwa_news_editors').insert({ user_id: userId }).select()
    : await sb.from('fmwa_news_editors').delete().eq('user_id', userId).select();
  // 23505 is the user_id primary key: a double-tap on a phone fires two
  // inserts, and the second means already-assigned, not failed.
  if (res.error && res.error.code !== '23505') {
    if (res.error.code === '42501') {
      throw new Error('You do not have permission to change assignments.');
    }
    throw new Error(res.error.message);
  }
}
