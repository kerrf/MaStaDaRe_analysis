import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';

// Map pages pull in Leaflet; legal/info pages are rarely visited – none of that belongs in the landing bundle.
const ErzeugerPage = lazy(() => import('./pages/ErzeugerPage'));
const SpeicherPage = lazy(() => import('./pages/SpeicherPage'));
const MarktPage = lazy(() => import('./pages/MarktPage'));
const InfoPage = lazy(() => import('./pages/InfoPage'));
const ImpressumPage = lazy(() => import('./pages/ImpressumPage'));
const DatenschutzPage = lazy(() => import('./pages/DatenschutzPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="erzeuger/:land?/:kreis?" element={<ErzeugerPage />} />
          <Route path="speicher/:land?/:kreis?" element={<SpeicherPage />} />
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
