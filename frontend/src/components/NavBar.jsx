import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, Zap } from 'lucide-react';
import { SITE } from '../config/site';
import { DASHBOARD_MENUS, VIEWS, viewPath } from '../config/views';
import './NavBar.css';

const MAERKTE = [
  { label: 'Strom', to: '/maerkte/strom' },
  { label: 'Gas', to: '/maerkte/gas' },
  { label: 'CO₂', to: '/maerkte/co2' },
];

// The dashboards as menus of their pages (config/views.js): the page's name, and what it shows below it
const DASHBOARDS = DASHBOARD_MENUS.map((menu) => ({
  id: menu.id,
  label: menu.label,
  basePath: menu.basePath,
  items: Object.entries(menu.views).map(([view, text]) => ({
    label: VIEWS[view].label,
    text,
    icon: VIEWS[view].icon,
    to: viewPath(menu.basePath, view),
    end: view === 'karte',
  })),
}));

const linkClass = ({ isActive }) => `navbar__link${isActive ? ' is-active' : ''}`;
// The map of a dashboard is its base path: active only there, not on the dashboard's other pages
const isMapPath = (pathname, basePath) => {
  const rest = pathname.slice(basePath.length).split('/').filter(Boolean);
  return pathname.startsWith(basePath) && !Object.values(VIEWS).some((v) => v.path && rest[0] === v.path);
};

// A menu in the bar: opens on click (and on hover with a mouse), closes on a click outside, Escape or leaving it
function Dropdown({ id, label, active, open, onOpen, onClose, children }) {
  const ref = useRef(null);
  const leaveTimer = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => !ref.current?.contains(e.target) && onClose();
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const hover = (e) => {
    if (e.pointerType !== 'mouse' || window.matchMedia('(max-width: 900px)').matches) return;
    clearTimeout(leaveTimer.current);
    onOpen();
  };
  const leave = (e) => {
    if (e.pointerType !== 'mouse') return;
    leaveTimer.current = setTimeout(onClose, 180);
  };

  return (
    <div className="navbar__dropdown" ref={ref} onPointerEnter={hover} onPointerLeave={leave}>
      <button
        type="button"
        className={`navbar__link navbar__dropdownToggle${active ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => (open ? onClose() : onOpen())}
      >
        {label} <ChevronDown size={15} aria-hidden="true" className="navbar__chevron" />
      </button>
      <div id={`${id}-menu`} className={`navbar__menu${open ? ' is-open' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export default function NavBar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const close = useRef(() => setOpenMenu(null)).current;

  useEffect(() => {
    setMenuOpen(false);
    setOpenMenu(null);
  }, [pathname]);

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
          <NavLink to="/" end className={linkClass}>
            Übersicht
          </NavLink>

          {DASHBOARDS.map((dashboard) => (
            <Dropdown
              key={dashboard.id}
              id={dashboard.id}
              label={dashboard.label}
              active={pathname.startsWith(dashboard.basePath)}
              open={openMenu === dashboard.id}
              onOpen={() => setOpenMenu(dashboard.id)}
              onClose={close}
            >
              {dashboard.items.map((item) => {
                const Icon = item.icon;
                const current = item.end ? isMapPath(pathname, dashboard.basePath) : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`navbar__menuItem navbar__menuItem--page${current ? ' active' : ''}`}
                    aria-current={current ? 'page' : undefined}
                  >
                    <span className="navbar__menuIcon" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <span className="navbar__menuText">
                      <span className="navbar__menuLabel">{item.label}</span>
                      <span className="navbar__menuHint">{item.text}</span>
                    </span>
                  </Link>
                );
              })}
            </Dropdown>
          ))}

          <Dropdown
            id="maerkte"
            label="Märkte"
            active={pathname.startsWith('/maerkte')}
            open={openMenu === 'maerkte'}
            onOpen={() => setOpenMenu('maerkte')}
            onClose={close}
          >
            {MAERKTE.map((item) => (
              <NavLink key={item.to} to={item.to} className="navbar__menuItem">
                {item.label}
                <span className="badge badge--soon badge--xs">bald</span>
              </NavLink>
            ))}
          </Dropdown>

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
