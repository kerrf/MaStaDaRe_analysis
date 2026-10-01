import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { VIEWS, viewsOf } from './config/views';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';

// Map pages pull in Leaflet; legal/info pages are rarely visited – none of that belongs in the landing bundle.
const ErzeugerPage = lazy(() => import('./pages/ErzeugerPage'));
const SpeicherPage = lazy(() => import('./pages/SpeicherPage'));
const GasPage = lazy(() => import('./pages/GasPage'));
const MarktPage = lazy(() => import('./pages/MarktPage'));
const InfoPage = lazy(() => import('./pages/InfoPage'));
const ImpressumPage = lazy(() => import('./pages/ImpressumPage'));
const DatenschutzPage = lazy(() => import('./pages/DatenschutzPage'));

// The routes of a dashboard's pages: "/erzeuger/zubau", "/erzeuger/anlagen/sn/14524", … and the map at "/erzeuger/sn/14524".
// The pages' names never collide with a Land's code (two letters).
function dashboardRoutes(id, Page) {
  return (
    <Route path={id}>
      {viewsOf(id)
        .filter((view) => view !== 'karte')
        .map((view) => (
          <Route
            key={view}
            path={VIEWS[view].scoped ? `${VIEWS[view].path}/:land?/:kreis?` : VIEWS[view].path}
            element={<Page view={view} />}
          />
        ))}
      <Route path=":land?/:kreis?" element={<Page view="karte" />} />
    </Route>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          {dashboardRoutes('erzeuger', ErzeugerPage)}
          {dashboardRoutes('speicher', SpeicherPage)}
          {dashboardRoutes('gas', GasPage)}
          <Route path="maerkte/:markt" element={<MarktPage />} />
          <Route path="info" element={<InfoPage />} />
          <Route path="impressum" element={<ImpressumPage />} />
          <Route path="datenschutz" element={<DatenschutzPage />} />

          {/* Old URLs that may already be shared */}
          <Route path="map" element={<Navigate to="/erzeuger" replace />} />
          <Route path="map2" element={<Navigate to="/erzeuger" replace />} />
          <Route path="map3" element={<Navigate to="/erzeuger" replace />} />
          <Route path="storage-map" element={<Navigate to="/speicher" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
