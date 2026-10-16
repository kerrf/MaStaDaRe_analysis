import Dashboard from '../features/dashboard/Dashboard';
import { NETZ } from '../config/dashboards';

// view: the page of the dashboard (config/views.js), from the route
export default function NetzPage({ view = 'karte' }) {
  return <Dashboard config={NETZ} view={view} />;
}
