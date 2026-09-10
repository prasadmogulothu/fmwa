import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AHome from './designs/a/Home.jsx';
import AEvent from './designs/a/Event.jsx';
import BHome from './designs/b/Home.jsx';
import BEvent from './designs/b/Event.jsx';
import './base.css';
import './designs/a/style.css';
import './designs/b/style.css';

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
        <Route path="/b" element={<BHome />} />
        <Route path="/b/event/:slug" element={<BEvent />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
