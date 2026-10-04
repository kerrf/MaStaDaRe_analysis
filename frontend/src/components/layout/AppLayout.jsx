import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { VIEW_PATHS } from '../../config/views';
import { routeOf } from '../../lib/usage';
import NavBar from '../NavBar';
import Footer from '../Footer';

// Page views (Vercel Web Analytics) and how fast the pages are for their visitors (Speed Insights), per page and per
// route: a page view on every new path, not on a new choice in the query (technology, filters)
function SiteAnalytics() {
  const { pathname } = useLocation();
  const route = routeOf(pathname);
  return (
    <>
      <Analytics route={route} path={pathname} />
      <SpeedInsights route={route} />
    </>
  );
}

// Scroll to top when switching sections or the pages of a dashboard (not when only the region inside a page changes),
// and honour #anchors even on lazily loaded pages.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  const [, first = '', second = ''] = pathname.split('/');
  const section = VIEW_PATHS.has(second) ? `${first}/${second}` : first;

  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [section, hash]);

  useEffect(() => {
    if (!hash) return undefined;
    let timer;
    let tries = 0;
    const attempt = () => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) target.scrollIntoView({ block: 'start' });
      else if (tries++ < 60) timer = setTimeout(attempt, 50);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [pathname, hash]);

  return null;
}

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-label="Seite wird geladen">
      <div className="spinner" />
    </div>
  );
}

export default function AppLayout() {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Zum Inhalt springen
      </a>
      <ScrollManager />
      <NavBar />
      <main id="main" className="app__main">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <SiteAnalytics />
    </div>
  );
}
