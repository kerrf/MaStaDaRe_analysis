// The national expansion targets: installed power in MW, as Bruttoleistung (the Bundesnetzagentur measures the expansion
// by it, and so do the blocks that compare with them). The whole path of each law, checked against
// gesetze-im-internet.de on 05.10.2026 – check again when the law changes:
// Solar and Wind an Land: EEG 2023, § 4 ("im Jahr …"); Wind auf See: WindSeeG, § 1 Abs. 2 ("bis zum Jahr …", at least).
export const TARGETS = {
  solar: {
    label: 'Solar',
    source: 'EEG 2023, § 4',
    href: 'https://www.gesetze-im-internet.de/eeg_2014/__4.html',
    goals: { 2024: 88000, 2026: 128000, 2028: 172000, 2030: 215000, 2035: 309000, 2040: 400000 },
  },
  wind_an_land: {
    label: 'Wind an Land',
    source: 'EEG 2023, § 4',
    href: 'https://www.gesetze-im-internet.de/eeg_2014/__4.html',
    goals: { 2024: 69000, 2026: 84000, 2028: 99000, 2030: 115000, 2035: 157000, 2040: 160000 },
  },
  wind_auf_see: {
    label: 'Wind auf See',
    source: 'WindSeeG, § 1',
    href: 'https://www.gesetze-im-internet.de/windseeg/__1.html',
    goals: { 2030: 30000, 2035: 40000, 2045: 70000 },
  },
};

// Years from the Datenstand (ISO date) to the end of a target year, the time left to reach it
export function yearsLeft(datenstand, year) {
  const from = new Date(`${datenstand}T00:00:00`);
  const to = new Date(year, 11, 31);
  return Math.max(0, (to - from) / (365.25 * 24 * 3600 * 1000));
}

// How much a year has to be added from now on to reach a target in time (MW per year)
export const neededPerYear = (installed, target, years) => (years > 0 ? Math.max(0, target - installed) / years : 0);
