import Dashboard from '../features/dashboard/Dashboard';
import { GAS } from '../config/dashboards';

// view: the page of the dashboard (config/views.js), from the route
export default function GasPage({ view = 'karte' }) {
  return <Dashboard config={GAS} view={view} />;
}
