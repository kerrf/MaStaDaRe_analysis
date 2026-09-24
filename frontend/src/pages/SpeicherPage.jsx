import MapDashboard from '../features/dashboard/MapDashboard';
import { SPEICHER } from '../config/dashboards';

export default function SpeicherPage() {
  return <MapDashboard config={SPEICHER} />;
}
