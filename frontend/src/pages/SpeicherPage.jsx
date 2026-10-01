import Dashboard from '../features/dashboard/Dashboard';
import { SPEICHER } from '../config/dashboards';

// view: the page of the dashboard (config/views.js), from the route
export default function SpeicherPage({ view = 'karte' }) {
  return <Dashboard config={SPEICHER} view={view} />;
}
