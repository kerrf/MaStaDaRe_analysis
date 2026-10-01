import Dashboard from '../features/dashboard/Dashboard';
import { ERZEUGER } from '../config/dashboards';

// view: the page of the dashboard (config/views.js), from the route
export default function ErzeugerPage({ view = 'karte' }) {
  return <Dashboard config={ERZEUGER} view={view} />;
}
