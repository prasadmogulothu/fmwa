import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SB } from './sb.js';

// Admin-only client. The public site keeps its plain fetch in sb.js; this is
// the one place that needs session persistence and access-token refresh, and
// it only ever loads inside the lazy /admin chunk.
export const sb = createClient(SB.url, SB.key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fmwa-admin' }
});

export const ADMIN = 'fmwa_admin';
export const COMMITTEE = 'fmwa_committee';
export const DOMAIN = '@fortunemeadows.local';

// The Postgres role PostgREST switches into lives in the JWT's `role` claim,
// and that same claim is what RLS keys off. Read it from the token rather than
// from anything the client is free to edit.
export function roleOf(session) {
  if (!session?.access_token) return null;
  try {
    const [, payload] = session.access_token.split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).role || null;
  } catch {
    return null;
  }
}

export function useSession() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sb.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setReady(true);
      })
      .catch(() => setReady(true));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, role: roleOf(session), userId: session?.user?.id || null, ready };
}

export async function signIn(username, password) {
  const id = String(username).trim().toLowerCase();
  const email = id.includes('@') ? id : id + DOMAIN;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signOut() {
  await sb.auth.signOut();
}
