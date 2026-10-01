import MapDashboard from '../features/dashboard/MapDashboard';
import { GAS } from '../config/dashboards';

export default function GasPage() {
  return <MapDashboard config={GAS} />;
}
