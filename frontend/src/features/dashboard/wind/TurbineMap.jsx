import { useMemo, useState } from 'react';
import { ChartScatter } from 'lucide-react';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../../components/ui/ChartExport';
import SegmentedControl from '../../../components/ui/SegmentedControl';
import Setting, { SettingsRow } from '../../../components/ui/Setting';
import { GRANULARITIES } from '../../../config/dashboards';
import { fileName, round } from '../../../lib/files';
import { useTopology } from '../../../lib/data';
import { formatNumber } from '../../../lib/format';
import AnalysisPanel from '../AnalysisPanel';
import GeoPlot from './GeoPlot';
import { VARIABLES, niceTicks, quantile } from './turbines';

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

const BAND = 0.5; // degrees of latitude per band of the profile
const formatLat = (lat) => `${formatNumber(lat, lat % 1 ? 1 : 0)}°`;

/**
 * Anlagengröße je nach geographischem Standort: the median of a size per Land or Kreis, or every turbine as a dot
 * coloured by it – and on the same map, from south to north, the size per half degree of latitude: dashed lines mark
 * the bands across the map, beside it each band's median and middle half, level with the band. scopeKey: the area – a
 * Land shows its Kreise, a Kreis or Gemeinde its Kreis.
 */
export default function TurbineMap({ turbines, scopeKey, scopeName, fileBase, anchor = 'analyse-wind-karte' }) {
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
  // Where the latitudes lie on the map (GeoPlot): the bands line up with it
  const [layout, setLayout] = useState(null);

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
  // The areas' names for the CSV, from their boundaries (cached with the map)
  const boundaries = useTopology(TOPOLOGY[level]);
  const names = useMemo(() => new Map((boundaries.data?.features ?? []).map((f) => [f.properties.ags, f.properties.name])), [boundaries.data]);

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
      const band = Math.floor(lat / BAND) * BAND;
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

  const settings = (
    <SettingsRow>
      <Setting label="Größe">
        <SegmentedControl label="Größe" options={VARIABLES.map(({ id, label }) => ({ id, label }))} value={variableId} onChange={setVariableId} />
      </Setting>
      <Setting label="Darstellung">
        <SegmentedControl label="Darstellung" options={MODES} value={mode} onChange={setMode} />
      </Setting>
      {levels.length > 1 && (
        <Setting label="Gebiete">
          <SegmentedControl
            label="Gebiete"
            options={[
              { id: 'bundesland', label: 'Bundesländer' },
              { id: 'landkreis', label: 'Landkreise' },
            ]}
            value={level}
            onChange={setLevel}
            disabled={mode !== 'flaechen'}
            hint="Nur beim Median je Gebiet"
          />
        </Setting>
      )}
    </SettingsRow>
  );
  const panel = (children) => (
    <AnalysisPanel
      id={anchor}
      icon={ChartScatter}
      title="Anlagengröße je nach geographischem Standort"
      lead={`${scopeName} · ${variable.label} der Windenergieanlagen nach Ort und nach Breitengrad`}
      settings={settings}
    >
      {children}
    </AnalysisPanel>
  );
  if (!stats) return panel(<ChartPlaceholder variant="bars" title={turbines.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />);

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
  const ticks = niceTicks(Math.max(1, ...(profile ?? []).map((p) => p.q3)), 3);
  const profileMax = ticks.at(-1);
  const at = (v) => `${(v / profileMax) * 100}%`;
  // The band lines on the map: every half degree within its height
  const lines = [];
  for (let lat = 45; layout && lat <= 56; lat += BAND) {
    const y = layout.latToY(lat);
    if (y > 0.5 && y < layout.height - 0.5) lines.push({ lat, y });
  }

  const csv = {
    name: 'wind-karte',
    filename: fileName(fileBase, 'wind', variable.id, level),
    rows: () => [
      ...[...stats.areas]
        .map(([key, area]) => ({
          Ebene: level === 'bundesland' ? 'Bundesland' : 'Landkreis',
          Gebiet: names.get(key) ?? key,
          Schlüssel: key,
          Anlagen: area.n,
          [`Median ${variable.label} (${variable.unit})`]: round(area.median, 2),
        }))
        .sort((a, b) => a.Schlüssel.localeCompare(b.Schlüssel)),
      ...(profile ?? []).map((p) => ({
        Ebene: 'Breitengrad',
        Gebiet: `${formatLat(p.band)}–${formatLat(p.band + BAND)} N`,
        Schlüssel: null,
        Anlagen: p.n,
        [`Median ${variable.label} (${variable.unit})`]: round(p.median, 2),
        [`Unteres Quartil (${variable.unit})`]: round(p.q1, 2),
        [`Oberes Quartil (${variable.unit})`]: round(p.q3, 2),
      })),
    ],
  };

  return panel(
    <>
      <div className="wind-geo__head">
        <div className="wind-map__scale">
          <span className="tabular">{fmt(stats.lo)}</span>
          <span className="wind-map__ramp" style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
          <span className="tabular">{fmt(stats.hi)}</span>
        </div>
        <div className="wind-geo__key">
          <strong>Je halbem Breitengrad</strong>
          <span>
            <span className="wind-geo__key-dot" aria-hidden="true" /> Median
          </span>
          <span>
            <span className="wind-geo__key-band" aria-hidden="true" /> mittlere Hälfte
          </span>
        </div>
      </div>
      <div className="wind-geo" style={{ height: layout?.height }}>
        <div className="wind-geo__map">
          <GeoPlot
            topology={TOPOLOGY[mode === 'punkte' && scopeDigits === 0 ? 'bundesland' : level]}
            within={within}
            fillOf={fillOf}
            describe={describe}
            dots={dots}
            maxHeight={640}
            onLayout={setLayout}
            label={`${variable.label} der Windenergieanlagen auf der Karte`}
          />
        </div>
        {/* The bands' edges across the map and the profile */}
        <div className="wind-geo__lines" aria-hidden="true">
          {lines.map(({ lat, y }) => (
            <div key={lat} className="wind-geo__line" style={{ top: y }}>
              <span className="tabular">{formatLat(lat)} N</span>
            </div>
          ))}
        </div>
        <ol className="wind-geo__profile" aria-label={`${variable.label} von Süd nach Nord, je halbem Breitengrad`}>
          {layout &&
            (profile ?? []).map((p) => {
              const [top, bottom] = [layout.latToY(p.band + BAND), layout.latToY(p.band)];
              if (bottom <= 0 || top >= layout.height) return null;
              return (
                <li
                  key={p.band}
                  style={{ top, height: bottom - top }}
                  title={`${formatLat(p.band)}–${formatLat(p.band + BAND)} N: ${formatNumber(p.n)} Anlagen, Median ${fmt(p.median)}, mittlere Hälfte ${fmt(p.q1)}–${fmt(p.q3)}`}
                >
                  <span className="visually-hidden">
                    {formatLat(p.band)} bis {formatLat(p.band + BAND)} Nord:
                  </span>
                  <span className="wind-geo__track">
                    <span className="wind-profile__band" style={{ left: at(p.q1), width: at(p.q3 - p.q1) }} />
                    <span className="wind-profile__median" style={{ left: at(p.median), background: color(p.median) }} />
                  </span>
                  <span className="wind-geo__value tabular">{fmt(p.median)}</span>
                  <span className="wind-geo__count tabular">{formatNumber(p.n)} Anl.</span>
                </li>
              );
            })}
        </ol>
      </div>
      {/* The scale of the profile, under its tracks */}
      <div className="wind-geo__axis" aria-hidden="true">
        <span className="wind-geo__axis-track">
          {ticks.map((t) => (
            <span key={t} className="tabular" style={{ left: at(t) }}>
              {formatNumber(t, variable.digits)}
              {t === profileMax && ` ${variable.unit}`}
            </span>
          ))}
        </span>
      </div>
      <ChartFoot csv={csv}>
        <p className="wind-note">
          {mode === 'punkte'
            ? 'Jede Anlage an ihrem Standort, die großen obenauf. Anlagen auf See und ohne Koordinaten fehlen. '
            : `Median der Anlagen je Gebiet; grau: weniger als ${MIN_UNITS} Anlagen. `}
          Farben von {fmt(stats.lo)} bis {fmt(stats.hi)}
          {mode === 'punkte' ? ' (2 bis 98 % aller Anlagen).' : ' (kleinster bis größter Median).'} Rechts je halbem Breitengrad – zwischen
          den gestrichelten Linien – der Median der Anlagen an Land und ihre mittlere Hälfte (25 bis 75 %), ab {MIN_UNITS * 4} Anlagen.
        </p>
      </ChartFoot>
    </>,
  );
}
