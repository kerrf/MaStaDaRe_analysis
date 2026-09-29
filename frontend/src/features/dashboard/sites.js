// Dashboards that show sites (pumped-storage plants) as icons instead of shaded areas.
import { GERMANY_BOUNDS } from '../../config/regions';

export const isActive = (plant) => plant.status === 'in Betrieb';

// Plants registered as several Speicheranlagen (Wehr, Vianden, ...) share their location: one icon for all of them.
export function groupByLocation(plants) {
  const sites = new Map();
  for (const plant of plants) {
    const key = `${plant.lat.toFixed(3)},${plant.lon.toFixed(3)}`;
    if (!sites.has(key)) sites.set(key, { key, lat: plant.lat, lon: plant.lon, plants: [] });
    sites.get(key).plants.push(plant);
  }
  return [...sites.values()].map((site) => ({ ...site, active: site.plants.some(isActive) }));
}

// Plants in operation per Bundesland or Landkreis, shaped like the stats rows of the other dashboards (for the KPIs).
// Plants abroad (Austria, Luxembourg) have no Gemeindeschlüssel: they are on the map only.
const KEY_LENGTH = { bundesland: 2, landkreis: 5 };

export function perRegion(plants, level) {
  const rows = new Map();
  for (const plant of plants) {
    if (!plant.ags || !isActive(plant)) continue;
    const key = plant.ags.slice(0, KEY_LENGTH[level]);
    const row = rows.get(key) ?? { [level]: key, plants: 0, total_power: 0, pump_power: 0 };
    row.plants += 1;
    row.total_power += plant.total_power ?? 0;
    row.pump_power += plant.pump_power ?? 0;
    rows.set(key, row);
  }
  return [...rows.values()];
}

// Germany, widened so that every plant is in view
export function boundsAround(plants) {
  const [[south, west], [north, east]] = GERMANY_BOUNDS;
  return [
    [Math.min(south, ...plants.map((p) => p.lat)), Math.min(west, ...plants.map((p) => p.lon))],
    [Math.max(north, ...plants.map((p) => p.lat)), Math.max(east, ...plants.map((p) => p.lon))],
  ];
}
