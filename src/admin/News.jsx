import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN, useSession } from '../lib/auth.js';
import { today } from '../data/schedule.js';
import {
  addNews,
  canWriteNews,
  listNews,
  removeNews,
  setNewsPublished,
  updateNews
} from '../data/news.js';

// The noticeboard. Reachable by an admin and by a committee member the admin
// has given news access — RLS decides which, not this screen.

// today() reads the browser's local date. `new Date().toISOString()` would be
// UTC and show yesterday for anything posted after 5:30pm in India, which is
// exactly when a colony announcement gets written.
const blank = () => ({ id: null, date: today(), title: '', body: '' });

const nice = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export default function News() {
  const { role, userId, ready } = useSession();
  const [allowed, setAllowed] = useState(null);
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Same generation guard as the other admin screens: load() runs on mount and
  // after every change, so a stale result must not overwrite a newer one.
  const gen = useRef(0);

  const load = useCallback(async () => {
    if (!ready || !userId) return;
    const mine = ++gen.current;
    try {
      const may = await canWriteNews(role === ADMIN, userId);
      const next = may ? await listNews() : [];
      if (gen.current !== mine) return;
      setAllowed(may);
      setPosts(next);
      setErr('');
    } catch (e) {
      if (gen.current !== mine) return;
      setErr(e.message);
    } finally {
      if (gen.current === mine) setLoaded(true);
    }
  }, [ready, role, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e) {
    e.preventDefault();
    // Validated here rather than with `required` on the inputs: native
    // validation blocks the submit handler, so these messages never appear.
    const title = form.title.trim();
    if (!title) return setErr('Give the announcement a title.');
    if (!form.date) return setErr('Pick a date.');

    setBusy(true);
    setErr('');
    try {
      const fields = { date: form.date, title, body: form.body.trim() };
      if (form.id) await updateNews(form.id, fields);
      // A new post starts as a draft. Publishing is a separate, deliberate
      // action, from either the form or the list.
      else await addNews({ ...fields, published: false });
      setForm(null);
      load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(post) {
    try {
      await setNewsPublished(post.id, !post.published);
      // Reflect it immediately: the list should not read "Draft" if the
      // refresh below is the thing that fails.
      setPosts((list) =>
        list.map((p) => (p.id === post.id ? { ...p, published: !p.published } : p))
      );
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function drop(post) {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await removeNews(post.id);
      if (form?.id === post.id) setForm(null);
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!ready || !loaded) return null;

  if (!allowed) {
    return (
      <>
        <h2>News</h2>
        <p className="ad-err">{err || 'You have not been given access to the noticeboard.'}</p>
      </>
    );
  }

  const editing = form?.id ? posts.find((p) => p.id === form.id) : null;

  return (
    <>
      <h2>News</h2>
      <p className="ad-dim">
        Announcements for the colony. Only published ones appear on the website, newest first.
      </p>

      {err && <p className="ad-err">{err}</p>}

      {!form && (
        <button type="button" onClick={() => setForm(blank())}>
          Write an announcement
        </button>
      )}

      {form && (
        <form className="ad-news-form" onSubmit={save}>
          <div className="ad-grid">
            <label>
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label>
              Title
              <input
                value={form.title}
                placeholder="Water supply interruption on Saturday"
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={6}
              value={form.body}
              placeholder="The full announcement. Line breaks are kept."
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
          </label>

          <div className="ad-row">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : form.id ? 'Save changes' : 'Create as draft'}
            </button>
            <button
              type="button"
              className="ad-ghost"
              onClick={() => setForm(null)}
              disabled={busy}
            >
              Cancel
            </button>
            {/* Publishing from the form is only offered once the post exists —
                there is nothing to publish until it has been saved. */}
            {editing && (
              <button type="button" onClick={() => togglePublish(editing)}>
                {editing.published ? 'Unpublish' : 'Publish'}
              </button>
            )}
            {editing && (
              <span className={editing.published ? 'ad-ok' : 'ad-err'}>
                {editing.published ? 'Published' : 'Draft'}
              </span>
            )}
          </div>
        </form>
      )}

      {!posts.length && <p>Nothing on the noticeboard yet.</p>}

      {posts.map((p) => (
        <div className="ad-row" key={p.id}>
          <span className="ad-dim">{nice(p.date)}</span>
          <b>{p.title}</b>
          <span className={p.published ? 'ad-ok' : 'ad-err'}>
            {p.published ? 'Published' : 'Draft'}
          </span>
          <button type="button" className="ad-ghost" onClick={() => setForm({ ...p })}>
            Edit
          </button>
          <button type="button" className="ad-ghost" onClick={() => drop(p)}>
            Delete
          </button>
          {/* The publish control the brief asked for at the end of each row,
              as well as in the form. */}
          <button type="button" onClick={() => togglePublish(p)}>
            {p.published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      ))}
    </>
  );
}
