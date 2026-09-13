import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeIcon } from '../../components/icons.jsx';

// Two-way theme switch. To retire it, paste the winning gradient into
// --canopy-bg in style.css and delete THEMES, the .a-theme markup and the
// effect below — nothing else depends on them.
const THEMES = {
  BG1: ['Ink indigo', 'linear-gradient(165deg, #111c38 0%, #1d2c57 52%, #0a1023 100%)'],
  BG3: ['Deep teal', 'linear-gradient(165deg, #0d2b2c 0%, #12403c 52%, #08201f 100%)']
};
const KEY = 'fmwa-bg';
const remember = (k) => {
  try {
    localStorage.setItem(KEY, k);
  } catch {}
};
const recall = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function Head() {
  const [bg, setBg] = useState(() => (THEMES[recall()] ? recall() : 'BG1'));

  // Applied to the page wrapper, which is where --canopy-bg is declared.
  useEffect(() => {
    document
      .querySelectorAll('.a')
      .forEach((el) => el.style.setProperty('--canopy-bg', THEMES[bg][1]));
  }, [bg]);

  const pick = (k) => {
    remember(k);
    setBg(k);
  };

  return (
    <header className="a-head">
      <Link to="/" className="a-mark">
        <img className="a-logo" src="/assets/logo-mark.png" alt="" />
        <span className="a-mark-t">
          <b>Fortune Meadows</b>
          <i>Welfare Association</i>
        </span>
      </Link>
      <div className="a-headr">
        <Link to="/" className="a-home" aria-label="Home" title="Home">
          <HomeIcon />
        </Link>
        <Link className="a-nav" to="/aboutus">
          About Us
        </Link>
        <Link className="a-nav" to="/#festivals">
          Events
        </Link>
        <Link className="a-nav" to="/news">
          News
        </Link>
        <div className="a-theme" role="group" aria-label="Theme">
          {Object.entries(THEMES).map(([k, [name, css]]) => (
            <button
              key={k}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={bg === k}
              style={{ background: css }}
              onClick={() => pick(k)}
            />
          ))}
        </div>
        {/* ponytail: design B is parked, not deleted — the /b routes still work,
            the link back to it is just out of the header for now. */}
      </div>
    </header>
  );
}

export function Foot() {
  return (
    <footer className="a-foot">
      <div className="a-foot-c">
        <b>FMWA &copy; 2026</b>
        <small>Fortune Meadows Welfare Association. All rights reserved.</small>
      </div>
      <a className="pb" href="#">
        <span className="pb-t">
          <span>Powered by</span>
          <b>HHAppSolutions</b>
        </span>
        <img className="pb-logo" src="/assets/hh.png" alt="HHAppSolutions" />
      </a>
    </footer>
  );
}
