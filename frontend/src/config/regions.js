// code: URL slug (ISO 3166-2 suffix) · mapId: id in states_boundaries.topojson
// ags: Länderschlüssel (first 2 digits of every Kreis/Gemeinde key) · mastr: Bundesland code in the MaStR export
export const BUNDESLAENDER = [
  { code: 'bw', mapId: 'DEBW', ags: '08', mastr: '1402', name: 'Baden-Württemberg' },
  { code: 'by', mapId: 'DEBY', ags: '09', mastr: '1403', name: 'Bayern' },
  { code: 'be', mapId: 'DEBE', ags: '11', mastr: '1401', name: 'Berlin' },
  { code: 'bb', mapId: 'DEBB', ags: '12', mastr: '1400', name: 'Brandenburg' },
  { code: 'hb', mapId: 'DEHB', ags: '04', mastr: '1404', name: 'Bremen' },
  { code: 'hh', mapId: 'DEHH', ags: '02', mastr: '1406', name: 'Hamburg' },
  { code: 'he', mapId: 'DEHE', ags: '06', mastr: '1405', name: 'Hessen' },
  { code: 'mv', mapId: 'DEMV', ags: '13', mastr: '1407', name: 'Mecklenburg-Vorpommern' },
  { code: 'ni', mapId: 'DENI', ags: '03', mastr: '1408', name: 'Niedersachsen' },
  { code: 'nw', mapId: 'DENW', ags: '05', mastr: '1409', name: 'Nordrhein-Westfalen' },
  { code: 'rp', mapId: 'DERP', ags: '07', mastr: '1410', name: 'Rheinland-Pfalz' },
  { code: 'sl', mapId: 'DESL', ags: '10', mastr: '1412', name: 'Saarland' },
  { code: 'sn', mapId: 'DESN', ags: '14', mastr: '1413', name: 'Sachsen' },
  { code: 'st', mapId: 'DEST', ags: '15', mastr: '1414', name: 'Sachsen-Anhalt' },
  { code: 'sh', mapId: 'DESH', ags: '01', mastr: '1411', name: 'Schleswig-Holstein' },
  { code: 'th', mapId: 'DETH', ags: '16', mastr: '1415', name: 'Thüringen' },
];

export const findBundesland = (code) => BUNDESLAENDER.find((b) => b.code === code?.toLowerCase());
export const findBundeslandByMapId = (mapId) => BUNDESLAENDER.find((b) => b.mapId === mapId);

export const GERMANY_BOUNDS = [
  [47.27, 5.87],
  [55.06, 15.04],
];
