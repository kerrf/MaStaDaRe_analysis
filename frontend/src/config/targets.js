// The national expansion targets: installed power in MW, as Bruttoleistung (the Bundesnetzagentur measures the expansion
// by it, and so do the blocks that compare with them). Solar and Wind an Land: EEG 2023, § 4; Wind auf See: WindSeeG, § 1.
// Check them against the current law when it changes.
export const TARGETS = {
  solar: { label: 'Solar', source: 'EEG 2023, § 4', goals: { 2030: 215000, 2040: 400000 } },
  wind_an_land: { label: 'Wind an Land', source: 'EEG 2023, § 4', goals: { 2030: 115000, 2040: 160000 } },
  wind_auf_see: { label: 'Wind auf See', source: 'WindSeeG, § 1', goals: { 2030: 30000, 2045: 70000 } },
};

// Years from the Datenstand (ISO date) to the end of a target year, the time left to reach it
export function yearsLeft(datenstand, year) {
  const from = new Date(`${datenstand}T00:00:00`);
  const to = new Date(year, 11, 31);
  return Math.max(0, (to - from) / (365.25 * 24 * 3600 * 1000));
}

// How much a year has to be added from now on to reach a target in time (MW per year)
export const neededPerYear = (installed, target, years) => (years > 0 ? Math.max(0, target - installed) / years : 0);
