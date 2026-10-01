// Central place for site-wide facts. Everything marked TODO has to be filled in by you;
// the Impressum/Datenschutz pages and the footer read from here.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const SITE = {
  name: 'MaStR Dashboard',
  tagline: 'Marktstammdatenregister Visualisierung',
  url: 'https://mastr-data.de',

  // Shown as "Datenstand" until the nightly update has noted one (GET /meta/datenstand, see useDatenstand).
  dataStand: '2026-09-29',

  links: {
    github: 'https://github.com/kerrf',
    linkedin: 'https://www.linkedin.com/in/maxim-sokol-3997b6291/',
  },

  // TODO: Pflichtangaben für das Impressum (§ 5 DDG). Leere Felder werden als Platzhalter angezeigt.
  owner: {
    name: '',
    street: '',
    postalCity: '',
    email: '',
  },
};
