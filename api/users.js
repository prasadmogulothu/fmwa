// The only code in this project that holds the service-role key, and the only
// reason it exists: creating a Supabase user cannot be done from the browser.
//
// Every request is rejected unless the caller's own JWT resolves to a user
// whose role is fmwa_admin. That check runs before the body is read.
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROLES = ['fmwa_admin', 'fmwa_committee'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// This Supabase project is shared with other HHAppSolutions sites, so auth.users
// holds accounts that have nothing to do with Fortune Meadows. The tables were
// namespaced; authentication was not. Every path below is pinned to this one
// domain so the service-role key can never read, create or delete another
// tenant's account. The leading '@' is load-bearing: without it
// 'evil@notfortunemeadows.local' would pass endsWith(). Duplicated from
// src/lib/auth.js on purpose — that module imports React and supabase-js and
// cannot load in the serverless runtime.
export const SITE = '@fortunemeadows.local';
// The id reaches a URL template (`admin(`/${id}`, ...)`) verbatim, and the
// WHATWG URL parser normalises '..' segments — an unvalidated id can walk the
// path out of /auth/v1/admin/users and into an arbitrary Supabase endpoint,
// carried with the service-role key. A UUID check closes that off entirely.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Exported so api/users.check.mjs tests the rule the handler actually applies,
// instead of a copy of the number that can drift away from it.
export const MIN_PASSWORD = 8;

const weak = (p) => typeof p !== 'string' || p.length < MIN_PASSWORD;
const WEAK = `Password must be at least ${MIN_PASSWORD} characters.`;

const ours = (email) =>
  String(email || '')
    .toLowerCase()
    .endsWith(SITE);

const admin = (path, init = {}) =>
  fetch(`${URL}/auth/v1/admin/users${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });

async function caller(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${token}` }
  });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  if (!URL || !SERVICE) return res.status(500).json({ error: 'Server is not configured.' });

  const me = await caller(req);
  if (!me) return res.status(401).json({ error: 'Sign in first.' });
  // Role and tenant together, so "this function only ever touches
  // fortunemeadows.local" holds for the caller as well as for every target.
  if (me.role !== 'fmwa_admin' || !ours(me.email)) {
    return res.status(403).json({ error: 'Administrators only.' });
  }

  if (req.method === 'GET') {
    const r = await admin('');
    if (!r.ok) return res.status(502).json({ error: 'Could not list users.' });
    const { users = [] } = await r.json();
    return res
      .status(200)
      .json(
        users
          .filter((u) => ours(u.email))
          .map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }))
      );
  }

  if (req.method === 'POST') {
    const { email, password, role } = req.body || {};
    if (!EMAIL.test(String(email || ''))) {
      return res.status(400).json({ error: 'That email address does not look right.' });
    }
    // The regex above forbids a second '@', which is what makes this airtight.
    if (!ours(email)) {
      return res.status(400).json({ error: `Accounts can only be created at ${SITE}.` });
    }
    if (weak(password)) return res.status(400).json({ error: WEAK });
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Unknown role.' });
    }
    const r = await admin('', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, email_confirm: true })
    });
    const body = await r.json();
    if (!r.ok) {
      return res.status(400).json({ error: body.msg || body.message || 'Could not create user.' });
    }
    return res.status(201).json({ id: body.id, email: body.email, role: body.role });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    if (!UUID.test(id)) return res.status(400).json({ error: 'Missing id.' });
    const target = id.toLowerCase();
    if (target === me.id.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    // The id is a free query param, so the GET filter guards nothing here:
    // look the target up and refuse anything outside this site's domain.
    const who = await admin(`/${target}`);
    if (!who.ok) return res.status(404).json({ error: 'No such user.' });
    const { email } = await who.json();
    if (!ours(email))
      return res.status(403).json({ error: 'That account is not yours to delete.' });
    const r = await admin(`/${target}`, { method: 'DELETE' });
    if (!r.ok) return res.status(502).json({ error: 'Could not delete user.' });
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { id, password } = req.body || {};
    if (!UUID.test(String(id || ''))) return res.status(400).json({ error: 'Missing id.' });
    if (weak(password)) return res.status(400).json({ error: WEAK });
    const target = String(id).toLowerCase();
    // Same shape as DELETE, and for a worse reason: a reset on another
    // tenant's admin hands over their whole site. Look the target up and
    // refuse anything outside this domain before the service key writes.
    const who = await admin(`/${target}`);
    if (!who.ok) return res.status(404).json({ error: 'No such user.' });
    const { email } = await who.json();
    if (!ours(email)) {
      return res.status(403).json({ error: 'That account is not yours to change.' });
    }
    const r = await admin(`/${target}`, { method: 'PUT', body: JSON.stringify({ password }) });
    if (!r.ok) return res.status(502).json({ error: 'Could not set the password.' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return res.status(405).end();
}
