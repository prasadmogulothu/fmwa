import React, { Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AHome from './designs/a/Home.jsx';
import AEvent from './designs/a/Event.jsx';
import AAbout from './designs/a/About.jsx';
import ANews from './designs/a/News.jsx';
import BHome from './designs/b/Home.jsx';
import BEvent from './designs/b/Event.jsx';
import './base.css';
import './designs/a/style.css';
import './designs/b/style.css';

// Code-split: the public site ships none of the admin area or supabase-js.
//
// A returning PWA user boots a precached index.html that points at the
// previous deploy's Admin-<hash>.js. That file is gone, vercel.json's
// catch-all answers with HTML, and the import dies on a MIME error behind a
// Suspense fallback that says "Loading…" forever. Reload once to pick up the
// new index.html; the sessionStorage flag stops that becoming a loop when the
// import is failing for some other reason.
const RELOADED = 'fmwa-chunk-reload';
const Admin = lazy(() =>
  import('./admin/Admin.jsx').then(
    (m) => {
      sessionStorage.removeItem(RELOADED);
      return m;
    },
    (e) => {
      if (sessionStorage.getItem(RELOADED)) throw e;
      sessionStorage.setItem(RELOADED, '1');
      location.reload();
      // Never settles: the page is on its way out, and resolving would render
      // the fallback's replacement against a document being torn down.
      return new Promise(() => {});
    }
  )
);

// React Router keeps the old scroll position across routes; a gallery opened
// from halfway down the home page would otherwise start halfway down too.
function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.querySelector(hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<AHome />} />
        <Route path="/event/:slug" element={<AEvent />} />
        <Route path="/aboutus" element={<AAbout />} />
        <Route path="/news" element={<ANews />} />
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<div className="ad-login">Loading…</div>}>
              <Admin />
            </Suspense>
          }
        />
        <Route path="/b" element={<BHome />} />
        <Route path="/b/event/:slug" element={<BEvent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
