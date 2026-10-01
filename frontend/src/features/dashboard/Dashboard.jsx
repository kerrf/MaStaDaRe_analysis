import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import TodoNote from '../../components/ui/TodoNote';
import { hasData } from '../../config/dashboards';
import { DASHBOARD_MENUS, VIEWS, viewsOf } from '../../config/views';
import { useDatenstand } from '../../lib/data';
import { formatDate } from '../../lib/format';
import useDocumentTitle from '../../lib/useDocumentTitle';
import AnlagenView from './AnlagenView';
import RegionenView from './RegionenView';
import ZubauView from './ZubauView';
import useDashboardState from './useDashboardState';
import './dashboard.css';

// The map pulls in Leaflet: only for the map page
const MapView = lazy(() => import('./MapView'));
const PAGES = { karte: MapView, zubau: ZubauView, anlagen: AnlagenView, regionen: RegionenView };

function PageLoader() {
  return (
    <div className="dashboard-loading" role="status" aria-label="Seite wird geladen">
      <div className="spinner" />
    </div>
  );
}

/**
 * A dashboard (Erzeuger, Speicher, Gas) with its pages (config/views.js): the map, Zubau & Registrierungen, Anlagen,
 * Regionen. The header names the dashboard and the scope; tabs below it lead to the other pages, keeping the scope and
 * the choices (technology, filters) where the page has them.
 */
export default function Dashboard({ config, view }) {
  const state = useDashboardState(config, view);
  const datenstand = useDatenstand();
  const menu = DASHBOARD_MENUS.find((m) => m.id === config.id);
  const pages = viewsOf(config.id);
  const page = VIEWS[view];
  const showScope = page.scoped && state.region;
  // On a narrow screen the tabs scroll sideways: bring the current one into view
  const tabsRef = useRef(null);
  useLayoutEffect(() => {
    const nav = tabsRef.current;
    const tab = nav?.querySelector('[aria-current="page"]');
    if (tab && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2;
  }, [view]);

  useDocumentTitle([config.title, view !== 'karte' && page.label, showScope && state.scopeName].filter(Boolean).join(' · '));
  if (state.redirect) return <Navigate to={state.redirect} replace />;

  const Page = PAGES[view];
  const live = view !== 'karte' || hasData(state.technology);
  return (
    <div className="dashboard" data-topic={config.id}>
      <header className="dashboard-header">
        <div className="container dashboard-header__inner">
          <div className="dashboard-header__text">
            <span className="eyebrow">{config.eyebrow}</span>
            <h1 className="dashboard-header__title">
              {config.title}
              {view !== 'karte' && <span className="dashboard-header__page">{page.label}</span>}
              {showScope && <span className="dashboard-header__scope">{state.scopeName}</span>}
            </h1>
            <p className="dashboard-header__lead">{view === 'karte' ? config.description : `${menu.views[view]}.`}</p>
          </div>
          <div className="dashboard-header__meta">
            <Badge icon={Clock}>Datenstand {formatDate(datenstand)}</Badge>
            {live ? <Badge tone="live">Live-Daten</Badge> : <Badge tone="soon">In Vorbereitung</Badge>}
          </div>
        </div>
        {pages.length > 1 && (
          <nav ref={tabsRef} className="container dashboard-tabs" aria-label={`Seiten von ${config.title}`}>
            {pages.map((id) => {
              const { icon: Icon, label } = VIEWS[id];
              const current = id === view;
              return (
                <Link
                  key={id}
                  to={state.hrefOf(id)}
                  className={`dashboard-tabs__tab${current ? ' is-active' : ''}`}
                  aria-current={current ? 'page' : undefined}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      <div className="container dashboard-body">
        <Suspense fallback={<PageLoader />}>
          <Page config={config} state={state} />
        </Suspense>
        {view === 'karte' && config.todos?.map((todo) => <TodoNote key={todo}>{todo}</TodoNote>)}
      </div>
    </div>
  );
}
