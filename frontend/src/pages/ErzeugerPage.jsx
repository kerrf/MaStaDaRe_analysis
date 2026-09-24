import MapDashboard from '../features/dashboard/MapDashboard';
import { ERZEUGER } from '../config/dashboards';

export default function ErzeugerPage() {
  return <MapDashboard config={ERZEUGER} />;
}
