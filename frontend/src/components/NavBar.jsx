import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, Zap } from 'lucide-react';
import { SITE } from '../config/site';
import './NavBar.css';

const PRIMARY = [
  { label: 'Übersicht', to: '/', end: true },
  { label: 'Erzeuger', to: '/erzeuger' },
  { label: 'Speicher', to: '/speicher' },
];

const MAERKTE = [
  { label: 'Strom', to: '/maerkte/strom' },
  { label: 'Gas', to: '/maerkte/gas' },
  { label: 'CO₂', to: '/maerkte/co2' },
];

const linkClass = ({ isActive }) => `navbar__link${isActive ? ' is-active' : ''}`;

export default function NavBar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
    setMarketsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!marketsOpen) return undefined;
    const onPointerDown = (e) => !dropdownRef.current?.contains(e.target) && setMarketsOpen(false);
    const onKeyDown = (e) => e.key === 'Escape' && setMarketsOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [marketsOpen]);

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Link to="/" className="navbar__brand" aria-label={`${SITE.name} – Startseite`}>
          <span className="navbar__logo" aria-hidden="true">
            <Zap size={18} strokeWidth={2.25} />
          </span>
          <span className="navbar__brandText">
            <span className="navbar__brandTitle">{SITE.name}</span>
            <span className="navbar__brandSubtitle">{SITE.tagline}</span>
          </span>
        </Link>

        <nav id="primary-nav" className={`navbar__nav${menuOpen ? ' is-open' : ''}`} aria-label="Hauptnavigation">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              {item.label}
            </NavLink>
          ))}

          <div className="navbar__dropdown" ref={dropdownRef}>
            <button
              type="button"
              className={`navbar__link navbar__dropdownToggle${pathname.startsWith('/maerkte') ? ' is-active' : ''}`}
              aria-expanded={marketsOpen}
              aria-controls="maerkte-menu"
              onClick={() => setMarketsOpen((open) => !open)}
            >
              Märkte <ChevronDown size={15} aria-hidden="true" className="navbar__chevron" />
            </button>
            <div id="maerkte-menu" className={`navbar__menu${marketsOpen ? ' is-open' : ''}`}>
              {MAERKTE.map((item) => (
                <NavLink key={item.to} to={item.to} className="navbar__menuItem">
                  {item.label}
                  <span className="badge badge--soon badge--xs">bald</span>
                </NavLink>
              ))}
            </div>
          </div>

          <NavLink to="/info" className={linkClass}>
            Info
          </NavLink>
        </nav>

        <div className="navbar__actions">
          <div className="lang-switch" role="group" aria-label="Sprache">
            <button type="button" className="lang-switch__option is-active" aria-pressed="true">
              DE
            </button>
            <button type="button" className="lang-switch__option" disabled title="Englische Version folgt">
              EN
            </button>
          </div>
          <button
            type="button"
            className="icon-btn navbar__menuBtn"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? 'Menü schließen' : 'Menü öffnen'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
