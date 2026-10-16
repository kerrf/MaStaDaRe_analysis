import { useMemo, useState } from 'react';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../../components/ui/CsvLink';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import { GRANULARITIES } from '../../../config/dashboards';
import { regionName } from '../../../config/regions';
import { fileName, round } from '../../../lib/files';
import { formatNumber } from '../../../lib/format';
import GeoPlot from './GeoPlot';
import { VARIABLES, quantile } from './turbines';

const TOPOLOGY = Object.fromEntries(GRANULARITIES.map((g) => [g.id, g.topology]));
const MIN_UNITS = 5; // fewer turbines in an area: no median, the area stays grey
// Sequential: one green, light (small) to dark (large); validated with the periods' steps
const RAMP = ['#d9ecdc', '#a9d3b0', '#78b584', '#5b9d68', '#43844f', '#316a3b', '#21502a', '#13371b'];

const MODES = [
  { id: 'flaechen', label: 'Median je Gebiet' },
  { id: 'punkte', label: 'Jede Anlage' },
];

// A value between lo and hi as a colour of the ramp
const colorScale = (lo, hi) => (v) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1))) * (RAMP.length - 1);
  return RAMP[Math.round(t)];
};

// The key of a turbine's area on a level: Land (2 digits) or Kreis (5) of its Gemeindeschlüssel (a number)
const keyOf = (ags, digits) => (ags == null ? null : String(ags).padStart(8, '0').slice(0, digits));

/**
 * Where the big turbines stand: the median of a size per Land or Kreis, or every turbine as a dot coloured by it, and
 * beside the map the same size from south to north (median per half degree of latitude). scopeKey: the area – a Land
 * shows its Kreise, a Kreis or Gemeinde its Kreis.
 */
export default function TurbineMap({ turbines, scopeKey, fileBase }) {
  const { data, rows } = turbines;
  const [variableId, setVariableId] = useState('nabenhoehe');
  const [mode, setMode] = useState('flaechen');
  const scopeDigits = scopeKey === 'DE' ? 0 : scopeKey.length;
  const levels = scopeDigits === 0 ? ['bundesland', 'landkreis'] : ['landkreis'];
  const [levelChoice, setLevel] = useState('bundesland');
  const level = levels.includes(levelChoice) ? levelChoice : levels[0];
  const digits = level === 'bundesland' ? 2 : 5;
  const variable = VARIABLES.find((v) => v.id === variableId);
  const within = scopeDigits ? scopeKey.slice(0, Math.min(scopeDigits, 5)) : null;

  // Per area: the median and how many turbines; the range of the colours from all turbines (2 % to 98 %)
  const stats = useMemo(() => {
    if (!data || !rows) return null;
    const column = data[variable.id];
    const byArea = new Map();
    const all = [];
    for (const i of rows) {
      const v = column[i] * variable.scale;
      if (Number.isNaN(v)) continue;
      all.push(v);
      const key = keyOf(data.ags[i], digits);
      if (!key) continue;
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key).push(v);
    }
    all.sort((a, b) => a - b);
    const areas = new Map(
      [...byArea].map(([key, values]) => {
        values.sort((a, b) => a - b);
        return [key, { n: values.length, median: values.length >= MIN_UNITS ? quantile(values, 0.5) : null }];
      }),
    );
    // The colours span the areas' medians (their differences are what the map shows), the dots 2 to 98 % of all turbines
    const medians = [...areas.values()].map((a) => a.median).filter((m) => m != null);
    const [lo, hi] =
      mode === 'flaechen' && medians.length > 1 ? [Math.min(...medians), Math.max(...medians)] : [quantile(all, 0.02), quantile(all, 0.98)];
    return { areas, lo, hi, count: all.length };
  }, [data, rows, variable, digits, mode]);

  const color = stats ? colorScale(stats.lo, stats.hi) : null;

  const dots = useMemo(() => {
    if (mode !== 'punkte' || !data || !rows || !color) return null;
    const column = data[variable.id];
    // Small ones first, the big ones on top
    const order = Array.from(rows)
      .filter((i) => !Number.isNaN(column[i]) && !Number.isNaN(data.lon[i]))
      .sort((a, b) => column[a] - column[b]);
    return {
      lon: Float64Array.from(order, (i) => data.lon[i]),
      lat: Float64Array.from(order, (i) => data.lat[i]),
      color: order.map((i) => color(column[i] * variable.scale)),
    };
  }, [mode, data, rows, variable, color]);

  // South to north: the median per half degree of latitude (onshore)
  const profile = useMemo(() => {
    if (!data || !rows) return null;
    const column = data[variable.id];
    const bands = new Map();
    for (const i of rows) {
      const [lat, v] = [data.lat[i], column[i] * variable.scale];
      if (Number.isNaN(lat) || Number.isNaN(v) || data.ags[i] == null) continue;
      const band = Math.floor(lat * 2) / 2;
      if (!bands.has(band)) bands.set(band, []);
      bands.get(band).push(v);
    }
    return [...bands]
      .filter(([, values]) => values.length >= MIN_UNITS * 4)
      .map(([band, values]) => {
        values.sort((a, b) => a - b);
        return { band, n: values.length, q1: quantile(values, 0.25), median: quantile(values, 0.5), q3: quantile(values, 0.75) };
      })
      .sort((a, b) => b.band - a.band);
  }, [data, rows, variable]);

  if (!stats) return <ChartPlaceholder variant="bars" title={turbines.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />;

  const fmt = (v) => `${formatNumber(v, variable.digits)} ${variable.unit}`;
  const describe = (ags, name) => {
    const area = stats.areas.get(ags.slice(0, digits));
    return {
      title: name ?? ags,
      rows: area
        ? [
            [`Median ${variable.label}`, area.median == null ? `zu wenige Anlagen` : fmt(area.median)],
            ['Anlagen', formatNumber(area.n)],
          ]
        : [['Anlagen', 'keine']],
    };
  };
  const fillOf = (ags) => {
    const area = stats.areas.get(ags.slice(0, digits));
    if (mode === 'punkte') return null;
    return area?.median == null ? null : color(area.median);
  };
  const profileMax = Math.max(1, ...(profile ?? []).map((p) => p.q3));

  const csv = {
    name: 'wind-karte',
    filename: fileName(fileBase, 'wind', variable.id, level),
    rows: () =>
      [...stats.areas]
        .map(([key, area]) => ({
          [level === 'bundesland' ? 'Bundesland' : 'Landkreis']: regionName(key) ?? key,
          Schlüssel: key,
          Anlagen: area.n,
          [`Median ${variable.label} (${variable.unit})`]: round(area.median, 2),
        }))
        .sort((a, b) => a.Schlüssel.localeCompare(b.Schlüssel)),
  };

  return (
    <>
      <div className="wind-map__controls">
        <SegmentedControl label="Größe" options={VARIABLES.map(({ id, label }) => ({ id, label }))} value={variableId} onChange={setVariableId} />
        <SegmentedControl label="Darstellung" options={MODES} value={mode} onChange={setMode} />
        {mode === 'flaechen' && levels.length > 1 && (
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
      <div className="wind-map">
        <div className="wind-map__map">
          <GeoPlot
            topology={TOPOLOGY[mode === 'punkte' && scopeDigits === 0 ? 'bundesland' : level]}
            within={within}
            fillOf={fillOf}
            describe={describe}
            dots={dots}
            label={`${variable.label} der Windenergieanlagen auf der Karte`}
          />
          <div className="wind-map__scale">
            <span className="tabular">{fmt(stats.lo)}</span>
            <span className="wind-map__ramp" style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
            <span className="tabular">{fmt(stats.hi)}</span>
          </div>
        </div>
        <figure className="wind-profile" aria-label={`${variable.label} von Süd nach Nord`}>
          <figcaption>Von Süd nach Nord</figcaption>
          <p className="wind-profile__lead">Median je halbem Breitengrad, Band: mittlere Hälfte</p>
          <ol className="wind-profile__rows">
            {(profile ?? []).map((p) => (
              <li key={p.band} title={`${formatNumber(p.n)} Anlagen, mittlere Hälfte ${fmt(p.q1)}–${fmt(p.q3)}`}>
                <span className="wind-profile__lat tabular">{formatNumber(p.band, 1)}° N</span>
                <span className="wind-profile__track">
                  <span className="wind-profile__band" style={{ left: `${(p.q1 / profileMax) * 100}%`, width: `${((p.q3 - p.q1) / profileMax) * 100}%` }} />
                  <span className="wind-profile__median" style={{ left: `${(p.median / profileMax) * 100}%`, background: color(p.median) }} />
                </span>
                <span className="wind-profile__value tabular">{fmt(p.median)}</span>
              </li>
            ))}
          </ol>
        </figure>
      </div>
      <ChartFoot csv={csv}>
        <p className="wind-note">
          {mode === 'punkte'
            ? 'Jede Anlage an ihrem Standort, die großen obenauf. Anlagen auf See und ohne Koordinaten fehlen. '
            : `Median der Anlagen je Gebiet; grau: weniger als ${MIN_UNITS} Anlagen. `}
          Farben von {fmt(stats.lo)} bis {fmt(stats.hi)}
          {mode === 'punkte' ? ' (2 bis 98 % aller Anlagen).' : ' (kleinster bis größter Median).'}
        </p>
      </ChartFoot>
    </>
  );
}
