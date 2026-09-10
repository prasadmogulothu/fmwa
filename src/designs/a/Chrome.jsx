import { Link } from 'react-router-dom';
import { HomeIcon } from '../../components/icons.jsx';

export function Head({ home = false }) {
  return (
    <header className="a-head">
      <Link to="/" className="a-mark">
        Fortune Meadows
        <span>Welfare Association</span>
      </Link>
      <div className="a-headr">
        {!home && <Link className="a-allf" to="/#festivals">All festivals</Link>}
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
      <a className="pb" href="https://hhappsolutions.com" target="_blank" rel="noopener noreferrer">
        <span className="pb-t">
          <span>Powered by</span>
          <b>HHAppSolutions</b>
        </span>
        <img className="pb-logo" src="/assets/hh.png" alt="HHAppSolutions" />
      </a>
    </footer>
  );
}
