import { BatteryCharging, ChartColumnIncreasing, Sun, UtilityPole, Wind } from 'lucide-react';
import { formatNumber, formatPower, scaleAmount } from '../lib/format';

// The questions on the home page (features/home/QuestionGallery.jsx): each a question the data answers, the view that
// answers it (a link: its settings are in the URL), and the answer in one sentence, computed live from the API.
//   topic     the dashboard's colour (erzeuger, speicher, gas, netz); icon: the technology's
//   label     what the card is about, above the question
//   to        the view; cta: the link's words
//   answer    path: what the API is asked (relative to the API); text(rows, name): the sentence from its answer – name(key)
//             names a Land or Kreis by its key. Without an answer (loading, an error) the card shows the question alone.
// Drafts: to be worded anew.

// The row with the largest value of a field, and its value
const leader = (rows, field) => rows.reduce((best, row) => ((row[field] ?? 0) > (best?.[field] ?? -Infinity) ? row : best), null);
const sumOf = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
const power = (mw) => {
  const { value, unit } = formatPower(mw);
  return `${value} ${unit}`;
};

export const QUESTIONS = [
  {
    id: 'balkonkraftwerke',
    topic: 'erzeuger',
    icon: Sun,
    label: 'Solar · Balkonkraftwerke',
    question: 'Wo gibt es die meisten Balkonkraftwerke je Einwohner?',
    to: '/erzeuger?anlagenart=balkon&kennzahl=relative_population_power&ebene=landkreis',
    cta: 'Auf der Karte ansehen',
    answer: {
      path: '/solar/dashboard-stats?level=landkreis&anlagenart=balkon',
      text: (rows, name) => {
        const top = leader(rows, 'relative_population_power');
        return top && `Vorn: ${name(top.landkreis)} mit ${formatNumber(top.relative_population_power * 1000, 0)} W je Einwohner.`;
      },
    },
  },
  {
    id: 'wind-2025',
    topic: 'erzeuger',
    icon: Wind,
    label: 'Wind · Zubau',
    question: 'Wie viel Windkraft ging 2025 ans Netz – und wo?',
    to: '/erzeuger?technologie=wind&wert=zubau&zeit=2025',
    cta: 'Auf der Karte ansehen',
    answer: {
      path: '/karte/wind?level=bundesland&kennzahl=zubau&jahr=2025',
      text: (rows, name) => {
        const top = leader(rows, 'total_power');
        return top && `${power(sumOf(rows, 'total_power'))} – am meisten in ${name(top.bundesland)} (${power(top.total_power)}).`;
      },
    },
  },
  {
    id: 'grossspeicher',
    topic: 'speicher',
    icon: BatteryCharging,
    label: 'Speicher · Großspeicher',
    question: 'Wo stehen die meisten großen Batteriespeicher?',
    to: '/speicher?groesse=grossspeicher&ebene=landkreis',
    cta: 'Auf der Karte ansehen',
    answer: {
      path: '/battery/dashboard-stats?level=landkreis&groesse=grossspeicher',
      text: (rows, name) => {
        const top = leader(rows, 'total_capacity');
        const capacity = top && scaleAmount(top.total_capacity, 'MWh');
        return top && `Vorn: ${name(top.landkreis)} mit ${capacity.value} ${capacity.unit} in Großspeichern.`;
      },
    },
  },
  {
    id: 'hoechstspannung',
    topic: 'netz',
    icon: UtilityPole,
    label: 'Netzanschlüsse · Höchstspannung',
    question: 'Wie viel Erzeugung hängt direkt am Höchstspannungsnetz?',
    to: '/netz?spannung=hoechstspannung&kennzahl=total_power',
    cta: 'Auf der Karte ansehen',
    answer: {
      path: '/netz/dashboard-stats?level=bundesland&spannung=hoechstspannung',
      text: (rows) => `${power(sumOf(rows, 'total_power'))} an ${formatNumber(sumOf(rows, 'total_units'))} Netzanschlusspunkten.`,
    },
  },
  {
    id: 'solar-rekord',
    topic: 'erzeuger',
    icon: ChartColumnIncreasing,
    label: 'Solar · Zubau seit 2000',
    question: 'In welchem Jahr kam am meisten Solarleistung dazu?',
    to: '/erzeuger/zubau',
    cta: 'Zum Zubau',
    answer: {
      path: '/zubau/zeitverlauf?yearly=true&technology=solar_netto',
      text: (rows) => {
        const top = leader(rows, 'added');
        return top && `${top.year}: ${power(top.added)} neu (netto) – so viel wie in keinem anderen Jahr.`;
      },
    },
  },
];
