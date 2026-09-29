// code: URL slug (ISO 3166-2 suffix) · ags: Länderschlüssel, the key of the Land on the map and in the API (the first
// 2 digits of every Kreis/Gemeinde key) · mastr: Bundesland code in the MaStR export
export const BUNDESLAENDER = [
  { code: 'bw', ags: '08', mastr: '1402', name: 'Baden-Württemberg' },
  { code: 'by', ags: '09', mastr: '1403', name: 'Bayern' },
  { code: 'be', ags: '11', mastr: '1401', name: 'Berlin' },
  { code: 'bb', ags: '12', mastr: '1400', name: 'Brandenburg' },
  { code: 'hb', ags: '04', mastr: '1404', name: 'Bremen' },
  { code: 'hh', ags: '02', mastr: '1406', name: 'Hamburg' },
  { code: 'he', ags: '06', mastr: '1405', name: 'Hessen' },
  { code: 'mv', ags: '13', mastr: '1407', name: 'Mecklenburg-Vorpommern' },
  { code: 'ni', ags: '03', mastr: '1408', name: 'Niedersachsen' },
  { code: 'nw', ags: '05', mastr: '1409', name: 'Nordrhein-Westfalen' },
  { code: 'rp', ags: '07', mastr: '1410', name: 'Rheinland-Pfalz' },
  { code: 'sl', ags: '10', mastr: '1412', name: 'Saarland' },
  { code: 'sn', ags: '14', mastr: '1413', name: 'Sachsen' },
  { code: 'st', ags: '15', mastr: '1414', name: 'Sachsen-Anhalt' },
  { code: 'sh', ags: '01', mastr: '1411', name: 'Schleswig-Holstein' },
  { code: 'th', ags: '16', mastr: '1415', name: 'Thüringen' },
];

// The German sea (12-mile zone and EEZ): a region of its own on every level, for offshore wind.
export const OFFSHORE = { ags: 'offshore', name: 'Offshore' };

export const findBundesland = (code) => BUNDESLAENDER.find((b) => b.code === code?.toLowerCase());
export const findBundeslandByAgs = (ags) => BUNDESLAENDER.find((b) => b.ags === ags);
// Landkreise (and kreisfreie Städte) are keyed by the first 5 digits of the Gemeindeschlüssel; also their URL slug.
export const isKreisKey = (ags) => /^\d{5}$/.test(ags ?? '');
export const regionName = (ags) => findBundeslandByAgs(ags)?.name ?? (ags === OFFSHORE.ags ? OFFSHORE.name : ags);
export const withoutOffshore = (collection) =>
  collection && { ...collection, features: collection.features.filter((f) => f.properties.ags !== OFFSHORE.ags) };

export const GERMANY_BOUNDS = [
  [47.27, 5.87],
  [55.06, 15.04],
];
// Including the offshore area, which reaches out to the "Entenschnabel" in the North Sea
export const GERMANY_SEA_BOUNDS = [
  [47.27, 3.35],
  [55.92, 15.04],
];
