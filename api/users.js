// The only code in this project that holds the service-role key, and the only
// reason it exists: creating a Supabase user cannot be done from the browser.
//
// Every request is rejected unless the caller's own JWT resolves to a user
// whose role is fmwa_admin. That check runs before the body is read.
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ROLES = ['fmwa_admin', 'fmwa_committee'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (me.role !== 'fmwa_admin') return res.status(403).json({ error: 'Administrators only.' });

  if (req.method === 'GET') {
    const r = await admin('');
    if (!r.ok) return res.status(502).json({ error: 'Could not list users.' });
    const { users = [] } = await r.json();
    return res
      .status(200)
      .json(
        users.map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }))
      );
  }

  if (req.method === 'POST') {
    const { email, password, role } = req.body || {};
    if (!EMAIL.test(String(email || ''))) {
      return res.status(400).json({ error: 'That email address does not look right.' });
    }
    if (String(password || '').length < 10) {
      return res.status(400).json({ error: 'Password must be at least 10 characters.' });
    }
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
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (id === me.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const r = await admin(`/${id}`, { method: 'DELETE' });
    if (!r.ok) return res.status(502).json({ error: 'Could not delete user.' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).end();
}
