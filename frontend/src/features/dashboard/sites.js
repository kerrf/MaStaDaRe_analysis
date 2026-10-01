// Dashboards that show sites (pumped-storage plants, gas producers and storages) as icons instead of shaded areas.
import { GERMANY_BOUNDS } from '../../config/regions';

export const isActive = (plant) => plant.status === 'in Betrieb';
const isPlanned = (plant) => plant.status === 'in Planung';

// Plants at the same location share one icon: plants registered as several Speicheranlagen (Wehr, Vianden, ...), the
// storages of several operators at one site (Etzel, Epe, ...). The largest plant comes first (the API's order), its
// category colours the icon.
export function groupByLocation(plants) {
  const sites = new Map();
  for (const plant of plants) {
    const key = `${plant.lat.toFixed(3)},${plant.lon.toFixed(3)}`;
    if (!sites.has(key)) sites.set(key, { key, lat: plant.lat, lon: plant.lon, plants: [] });
    sites.get(key).plants.push(plant);
  }
  return [...sites.values()].map((site) => ({ ...site, active: site.plants.some(isActive) }));
}

// Plants per Bundesland or Landkreis, shaped like the stats rows of the other dashboards (for the KPIs): those in
// operation (`plants`) with the sums of `fields`, and those in planning (`planned`).
// Plants abroad (Austria, Luxembourg, the Netherlands) have no Gemeindeschlüssel: they are on the map only.
const KEY_LENGTH = { bundesland: 2, landkreis: 5 };

export function perRegion(plants, level, fields) {
  const sums = [...new Set(fields)]; // several KPIs may show the same field
  const rows = new Map();
  for (const plant of plants) {
    if (!plant.ags || !(isActive(plant) || isPlanned(plant))) continue;
    const key = plant.ags.slice(0, KEY_LENGTH[level]);
    const row = rows.get(key) ?? { [level]: key, plants: 0, planned: 0, ...Object.fromEntries(sums.map((f) => [f, 0])) };
    if (isPlanned(plant)) {
      row.planned += 1;
    } else {
      row.plants += 1;
      for (const field of sums) row[field] += plant[field] ?? 0;
    }
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
