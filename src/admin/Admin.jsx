import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ADMIN, COMMITTEE, signOut, useSession } from '../lib/auth.js';
import { canWriteNews } from '../data/news.js';
import Login from './Login.jsx';
import EventList from './EventList.jsx';
import Gallery from './Gallery.jsx';
import Timetable from './Timetable.jsx';
import Users from './Users.jsx';
import Password from './Password.jsx';
import Settings from './Settings.jsx';
import News from './News.jsx';
import './style.css';

export default function Admin() {
  const { role, userId, ready } = useSession();
  // Whether to show the News link. An admin always may write news; a committee
  // member may only if the admin added them to fmwa_news_editors. This decides
  // what renders — the RLS policy decides what works, and News.jsx refuses on
  // its own if someone reaches the route directly.
  const [news, setNews] = useState(false);
  useEffect(() => {
    if (!ready || !userId) return;
    canWriteNews(role === ADMIN, userId).then(setNews, () => setNews(false));
  }, [ready, role, userId]);

  if (!ready) return null;
  if (!role) return <Login />;
  // Signed in with a role this app knows nothing about — treat as no access
  // rather than guessing what they may see.
  if (role !== ADMIN && role !== COMMITTEE) {
    return (
      <div className="ad-login">
        <div className="ad-card">
          <h1>No access</h1>
          <p>This account is not set up for the committee area.</p>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ad">
      <header className="ad-head">
        <b>Fortune Meadows</b>
        <nav>
          <Link to="/admin">Events</Link>
          {role === ADMIN && <Link to="/admin/users">Users</Link>}
          {role === ADMIN && <Link to="/admin/settings">Uploads</Link>}
          {news && <Link to="/admin/news">News</Link>}
          <Link to="/admin/password">Change password</Link>
          <a href="/">View site</a>
        </nav>
        <span className="ad-who">{role === ADMIN ? 'Administrator' : 'Festival committee'}</span>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="ad-main">
        <Routes>
          <Route index element={<EventList />} />
          <Route path="event/:id" element={<Timetable />} />
          <Route path="event/:id/photos" element={<Gallery />} />
          <Route
            path="users"
            element={role === ADMIN ? <Users /> : <Navigate to="/admin" replace />}
          />
          <Route
            path="settings"
            element={role === ADMIN ? <Settings /> : <Navigate to="/admin" replace />}
          />
          {/* Declared unconditionally and gated inside News.jsx, which has to
              ask the database anyway — a committee member's news access is a
              row, not something the JWT carries. */}
          <Route path="news" element={<News />} />
          <Route path="password" element={<Password />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
