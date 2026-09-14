import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ADMIN, COMMITTEE, signOut, useSession } from '../lib/auth.js';
import Login from './Login.jsx';
import EventList from './EventList.jsx';
import Timetable from './Timetable.jsx';
import Users from './Users.jsx';
import './style.css';

export default function Admin() {
  const { role, ready } = useSession();

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
          <Route
            path="users"
            element={role === ADMIN ? <Users /> : <Navigate to="/admin" replace />}
          />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
