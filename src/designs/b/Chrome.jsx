import { Link } from 'react-router-dom';
import { HomeIcon } from '../../components/icons.jsx';

export function Head() {
  return (
    <header className="b-head">
      <Link to="/b" className="b-mark">
        <b>Fortune Meadows</b>
        <span>Welfare Association</span>
      </Link>
      <div className="b-headr">
        <Link to="/b" className="b-home" aria-label="Home" title="Home">
          <HomeIcon />
        </Link>
        <Link className="b-swap" to="/">Design A</Link>
      </div>
    </header>
  );
}

export function Foot() {
  return (
    <footer className="b-foot">
      <div className="b-foot-c">
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
