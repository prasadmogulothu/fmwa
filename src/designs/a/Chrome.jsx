import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HomeIcon } from '../../components/icons.jsx';

// ponytail: temporary preview switch. Once a background is chosen, paste the
// winner into --canopy-bg in style.css and delete BGS, the .a-bgs markup and
// the effect below — nothing else depends on them.
const BGS = {
  BG1: ['Ink indigo', 'linear-gradient(165deg, #111c38 0%, #1d2c57 52%, #0a1023 100%)'],
  BG2: ['Aubergine', 'linear-gradient(165deg, #2b1030 0%, #4a1740 52%, #170a1c 100%)'],
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
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};

export function Head({ home = false }) {
  const [bg, setBg] = useState(recall);

  // Applied to the page wrapper, which is where --canopy-bg is declared.
  useEffect(() => {
    if (!bg || !BGS[bg]) return;
    document.querySelectorAll('.a').forEach((el) => el.style.setProperty('--canopy-bg', BGS[bg][1]));
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
        {!home && <Link className="a-allf" to="/#festivals">All festivals</Link>}
        <div className="a-bgs" role="group" aria-label="Preview background">
          {Object.entries(BGS).map(([k, [name]]) => (
            <button key={k} type="button" title={name} aria-pressed={bg === k} onClick={() => pick(k)}>
              {k}
            </button>
          ))}
        </div>
        <Link to="/" className="a-home" aria-label="Home" title="Home">
          <HomeIcon />
        </Link>
        <Link className="a-swap" to="/b">Design B</Link>
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
