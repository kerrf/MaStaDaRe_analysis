import { useMemo, useState } from 'react';
import { Compass } from 'lucide-react';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/CsvLink';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { GRANULARITIES } from '../../config/dashboards';
import { API_BASE_URL } from '../../config/site';
import { RAMPS } from '../../lib/colorScale';
import { useJson, useTopology } from '../../lib/data';
import { fileName, round } from '../../lib/files';
import { formatNumber, formatPercent } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';
import GeoPlot from './wind/GeoPlot';
import './wind/wind.css';

const TOPOLOGY = Object.fromEntries(GRANULARITIES.map((g) => [g.id, g.topology]));
// Compass directions as azimuth from south: east negative, west positive (Nord at ±180)
const AZIMUTH = { nord: 180, nordost: -135, ost: -90, suedost: -45, sued: 0, suedwest: 45, west: 90, nordwest: 135 };
// East to west through south: blue, a neutral grey at Süd, orange (diverging)
const DIVERGING = ['#2a6496', '#6f97be', '#b5c6d6', '#e4ded2', '#efc08d', '#e28316', '#a85c0c'];

// What the map shows of each area's power by orientation. share: the orientations counted, of the power whose
// orientation is known
const MEASURES = [
  { id: 'sued', label: 'Anteil Süd', share: ['sued'] },
  { id: 'ost_west', label: 'Anteil Ost-West', share: ['ost_west'] },
  { id: 'nachgefuehrt', label: 'Anteil nachgeführt', share: ['nachgefuehrt'] },
  { id: 'mittel', label: 'Mittlere Ausrichtung' },
];

// The power-weighted mean direction of the 8 compass orientations (Ost-West, tracked, unknown left out), in degrees
// from south: negative towards east
function meanAzimuth(power, keys) {
  let [s, c] = [0, 0];
  keys.forEach((key, i) => {
    if (!(key in AZIMUTH)) return;
    const a = (AZIMUTH[key] * Math.PI) / 180;
    s += power[i] * Math.sin(a);
    c += power[i] * Math.cos(a);
  });
  return s || c ? (Math.atan2(s, c) * 180) / Math.PI : null;
}

const direction = (deg) => {
  if (deg == null) return '–';
  if (Math.abs(deg) < 0.5) return 'genau Süd';
  return `${formatNumber(Math.abs(deg), 1)}° nach ${deg < 0 ? 'Ost' : 'West'}`;
};

/**
 * Where the solar modules face, on the map: per Land or Kreis the share of the power facing south, east-west or
 * tracking the sun, or the mean direction (east ↔ west), and the areas ranked beside it. query: solar's selection
 * (Anlagenart, Leistung); scopeKey: a Land shows its Kreise, a Kreis its Kreis.
 */
export default function OrientationMap({ query, scopeKey, scopeName, fileBase, anchor }) {
  const scopeDigits = scopeKey === 'DE' ? 0 : scopeKey.length;
  const levels = scopeDigits === 0 ? ['bundesland', 'landkreis'] : ['landkreis'];
  const [levelChoice, setLevel] = useState('bundesland');
  const level = levels.includes(levelChoice) ? levelChoice : levels[0];
  const [measureId, setMeasureId] = useState('sued');
  const measure = MEASURES.find((m) => m.id === measureId);
  const within = scopeDigits === 0 ? null : scopeKey.slice(0, Math.min(scopeDigits, 5));
  const params = new URLSearchParams(query);
  params.set('level', level);
  if (within && within.length === 2) params.set('within', within);
  const table = useJson(`${API_BASE_URL}/solar/orientation/regions?${params}`);

  // Per area: the measure, its power and the total of known orientations
  const values = useMemo(() => {
    if (!table.data) return null;
    const keys = table.data.columns.map((c) => c.key);
    const known = keys.map((k) => k !== 'unbekannt');
    return new Map(
      table.data.rows
        .filter((row) => !within || row.region.startsWith(within))
        .map((row) => {
          const total = row.power.reduce((sum, p, i) => sum + (known[i] ? p : 0), 0);
          const value = measure.share
            ? total > 0
              ? measure.share.reduce((sum, key) => sum + row.power[keys.indexOf(key)], 0) / total
              : null
            : meanAzimuth(row.power, keys);
          return [row.region, { value, total }];
        }),
    );
  }, [table.data, measure, within]);

  const color = useMemo(() => {
    if (!values) return null;
    const list = [...values.values()].map((v) => v.value).filter((v) => v != null);
    if (!measure.share) {
      // Symmetric around Süd, as far as the areas go
      const span = Math.max(1, ...list.map(Math.abs));
      return { lo: -span, hi: span, of: (v) => DIVERGING[Math.round(((v + span) / (2 * span)) * (DIVERGING.length - 1))], ramp: DIVERGING };
    }
    const [lo, hi] = [Math.min(...list), Math.max(...list)];
    const ramp = RAMPS.orange;
    return { lo, hi, of: (v) => ramp[Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))) * (ramp.length - 1))], ramp };
  }, [values, measure]);

  const fmt = (v) => (v == null ? '–' : measure.share ? formatPercent(v) : direction(v));
  // The areas' names, from their boundaries (cached with the map)
  const areas = useTopology(TOPOLOGY[level]);
  const names = useMemo(() => new Map((areas.data?.features ?? []).map((f) => [f.properties.ags, f.properties.name])), [areas.data]);
  const ranked = values
    ? [...values]
        .filter(([, v]) => v.value != null)
        .sort((a, b) => b[1].value - a[1].value)
    : [];

  const csv = values && {
    name: 'solar-ausrichtung-karte',
    filename: fileName(fileBase, 'ausrichtung', measure.id, level),
    rows: () =>
      ranked.map(([key, v]) => ({
        Gebiet: names.get(key) ?? key,
        Schlüssel: key,
        [measure.share ? `${measure.label} (%)` : 'Mittlere Ausrichtung (Grad, negativ: Ost)']: round(measure.share ? v.value * 100 : v.value, 2),
        'Leistung mit bekannter Ausrichtung (MW)': round(v.total, 1),
      })),
  };

  return (
    <AnalysisPanel
      id={anchor}
      icon={Compass}
      title="Ausrichtung nach Region"
      lead={`${scopeName} · wohin die Module zeigen, je ${level === 'bundesland' ? 'Bundesland' : 'Landkreis'}, nach Leistung`}
    >
      <div className="wind-map__controls">
        <SegmentedControl label="Kennzahl" options={MEASURES.map(({ id, label }) => ({ id, label }))} value={measureId} onChange={setMeasureId} />
        {levels.length > 1 && (
          <SegmentedControl
            label="Gebiete"
            options={[
              { id: 'bundesland', label: 'Bundesländer' },
              { id: 'landkreis', label: 'Landkreise' },
            ]}
            value={level}
            onChange={setLevel}
          />
        )}
      </div>
      {!values || !color ? (
        <ChartPlaceholder variant="bars" title={table.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />
      ) : (
        <>
          <div className="wind-map">
            <div className="wind-map__map">
              <GeoPlot
                topology={TOPOLOGY[level]}
                within={within}
                fillOf={(ags) => {
                  const v = values.get(ags)?.value;
                  return v == null ? null : color.of(v);
                }}
                describe={(ags, name) => {
                  const v = values.get(ags);
                  return {
                    title: name ?? ags,
                    rows: [
                      [measure.label, fmt(v?.value)],
                      ['Leistung, Ausrichtung bekannt', `${formatNumber(v?.total ?? 0, 0)} MW`],
                    ],
                  };
                }}
                label={`${measure.label} der Solarleistung auf der Karte`}
              />
              <div className="wind-map__scale">
                <span className="tabular">{fmt(color.lo)}</span>
                <span className="wind-map__ramp" style={{ background: `linear-gradient(to right, ${color.ramp.join(', ')})` }} />
                <span className="tabular">{fmt(color.hi)}</span>
              </div>
            </div>
            <figure className="wind-profile">
              <figcaption>Rangfolge</figcaption>
              <p className="wind-profile__lead">{measure.share ? 'Höchster Anteil oben' : 'Am weitesten nach West oben, nach Ost unten'}</p>
              <ol className="wind-profile__rows orientation-ranking">
                {ranked.slice(0, level === 'bundesland' ? 16 : 12).map(([key, v]) => (
                  <li key={key}>
                    <span className="wind-profile__lat">{names.get(key) ?? key}</span>
                    <span className="wind-profile__track">
                      <span
                        className="wind-profile__median"
                        style={{ left: `${((v.value - color.lo) / (color.hi - color.lo || 1)) * 100}%`, background: color.of(v.value) }}
                      />
                    </span>
                    <span className="wind-profile__value tabular">{fmt(v.value)}</span>
                  </li>
                ))}
              </ol>
            </figure>
          </div>
          <ChartFoot csv={csv}>
            <p className="wind-note">
              Nach der Leistung der Anlagen in Betrieb, Hauptausrichtung der Module laut Register; Anlagen ohne Angabe (vor allem
              Balkonkraftwerke) zählen nicht mit.{' '}
              {measure.share
                ? `Farben vom kleinsten bis zum größten Anteil der Gebiete.`
                : 'Mittlere Ausrichtung: der nach Leistung gemittelte Winkel der acht Himmelsrichtungen (Ost-West und nachgeführt nicht mitgezählt), 0° ist genau Süd.'}
            </p>
          </ChartFoot>
        </>
      )}
    </AnalysisPanel>
  );
}
