import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import TodoNote from '../../components/ui/TodoNote';
import { hasData } from '../../config/dashboards';
import { dashboardTitle, kommuneTitle } from '../../config/seo';
import { DASHBOARD_MENUS, VIEWS, viewsOf } from '../../config/views';
import { useDatenstand } from '../../lib/data';
import { formatDate } from '../../lib/format';
import useDocumentTitle from '../../lib/useDocumentTitle';
import AnlagenView from './AnlagenView';
import NetzView from './NetzView';
import OverviewView from './overview/OverviewView';
import RegionenView from './RegionenView';
import ZubauView from './ZubauView';
import ScopeIndicator from './ScopeIndicator';
import { ScopeSlot } from './scopeSlot';
import useDashboardState from './useDashboardState';
import { Footnotes, FootnotesProvider } from './footnotes';
import './dashboard.css';

// The map pulls in Leaflet: only for the map page
const MapView = lazy(() => import('./MapView'));
const KommuneView = lazy(() => import('./KommuneView'));
const PAGES = {
  karte: MapView,
  ueberblick: OverviewView,
  kommune: KommuneView,
  zubau: ZubauView,
  anlagen: AnlagenView,
  regionen: RegionenView,
  spannungsebenen: NetzView,
};

function PageLoader() {
  return (
    <div className="dashboard-loading" role="status" aria-label="Seite wird geladen">
      <div className="spinner" />
    </div>
  );
}

/**
 * A dashboard (Erzeuger, Speicher, Gas) with its pages (config/views.js): the map, Auf einen Blick, Zubau &
 * Registrierungen, Anlagen, Regionen im Detail (a Landkreis and its Gemeinden), Regionen im Vergleich. The header – the
 * settings of every page, apart from what the pages show – names the dashboard once, holds the page's choice of the
 * area (ScopeBar, through ScopeSlot), and below it the tabs lead to the other pages, keeping the area and the choices
 * (technology, filters) where the page has them.
 */
export default function Dashboard({ config, view }) {
  const state = useDashboardState(config, view);
  // The header's place for the area's choice: set as the header mounts, so the page's ScopeBar is there in the first paint
  const [scopeSlot, setScopeSlot] = useState(null);
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

  // A Landkreis/Gemeinde page is titled by its place, as people search for it (config/seo.js)
  const kommune =
    view === 'kommune' &&
    kommuneTitle(config.id, { landName: state.region?.name, kreisName: state.kreisName, gemeindeName: state.gemeindeAgs && state.scopeName });
  useDocumentTitle(kommune || dashboardTitle(config.title, view !== 'karte' && page.label, showScope && state.scopeName));
  if (state.redirect) return <Navigate to={state.redirect} replace />;

  const Page = PAGES[view];
  const live = view !== 'karte' || hasData(state.technology);
  // The page and the area: on screen the tabs and the Gebiet say them, the heading names them for screen readers and
  // search engines
  const context = [view !== 'karte' && page.label, showScope && state.scopeName].filter(Boolean).join(' · ');
  return (
    <div className="dashboard" data-topic={config.id}>
      <header className="dashboard-header">
        <div className="container dashboard-header__inner">
          <div className="dashboard-header__text">
            <h1 className="dashboard-header__title">
              {config.title}
              {context && <span className="visually-hidden"> – {context}</span>}
            </h1>
            {/* What the page shows, in the words of its menu entry */}
            <p className="dashboard-header__lead">{menu.views[view]}.</p>
          </div>
          <div className="dashboard-header__meta">
            <Badge icon={Clock}>Datenstand {formatDate(datenstand)}</Badge>
            {live ? <Badge tone="live">Live-Daten</Badge> : <Badge tone="soon">In Vorbereitung</Badge>}
          </div>
        </div>
        <div ref={setScopeSlot} className="container dashboard-header__scope-slot" />
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
        <ScopeSlot.Provider value={scopeSlot}>
          {/* Every remark of the page in one place, at its bottom */}
          <FootnotesProvider key={view}>
            <Suspense fallback={<PageLoader />}>
              <Page config={config} state={state} />
            </Suspense>
            <Footnotes />
          </FootnotesProvider>
        </ScopeSlot.Provider>
        {/* The area while its choice in the header is out of view */}
        {page.scoped && <ScopeIndicator state={state} anchor={scopeSlot} />}
        {/* Notes for development (config todos): only in `npm run dev`, not for visitors */}
        {import.meta.env.DEV && view === 'karte' && config.todos?.map((todo) => <TodoNote key={todo}>{todo}</TodoNote>)}
      </div>
    </div>
  );
}
