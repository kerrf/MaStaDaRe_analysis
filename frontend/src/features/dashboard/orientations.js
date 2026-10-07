// The compass directions clockwise from north, by the keys of mrt.solar_orientation
export const DIRECTIONS = [
  { id: 'nord', short: 'N', label: 'Nord' },
  { id: 'nordost', short: 'NO', label: 'Nordost' },
  { id: 'ost', short: 'O', label: 'Ost' },
  { id: 'suedost', short: 'SO', label: 'Südost' },
  { id: 'sued', short: 'S', label: 'Süd' },
  { id: 'suedwest', short: 'SW', label: 'Südwest' },
  { id: 'west', short: 'W', label: 'West' },
  { id: 'nordwest', short: 'NW', label: 'Nordwest' },
];
// No single direction: the two halves of the centre
export const CENTRE = [
  { id: 'ost_west', label: 'Ost-West', sign: -1 },
  { id: 'nachgefuehrt', label: 'Nachgeführt', sign: 1 },
];
