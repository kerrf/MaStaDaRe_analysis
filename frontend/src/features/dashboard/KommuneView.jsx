import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, ChartColumnIncreasing, Download, Search, Sun } from 'lucide-react';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { BASEMAPS, DEFAULT_BASEMAP } from '../../config/basemaps';
import { GRANULARITIES } from '../../config/dashboards';
import { BUNDESLAENDER, findBundeslandByAgs, isKreisKey } from '../../config/regions';
import { API_BASE_URL } from '../../config/site';
import { makeColorScale, scaleDomainMax } from '../../lib/colorScale';
import { statsUrl, useJson, useStats, useTopology } from '../../lib/data';
import { escapeHtml, formatAmount, formatFixed, formatNumber, formatPercent } from '../../lib/format';
import { bboxOf, labelPoint } from '../../lib/geometry';
import AnalysisPanel from './AnalysisPanel';
import { exportCsv } from './exportMap';
import KommuneMap from './KommuneMap';
import MapLegend from './MapLegend';
import OrientationRose from './OrientationRose';
import ScopeBar from './ScopeBar';
import SizeDistribution from './SizeDistribution';
import TechFilters from './TechFilters';
import { selectionOf } from './useDashboardState';

const GEMEINDEN_TOPOLOGY = GRANULARITIES.find((g) => g.id === 'gemeinde').topology;
const KREISE_TOPOLOGY = GRANULARITIES.find((g) => g.id === 'landkreis').topology;

// What the map can shade the Gemeinden by
const METRICS = [
  { id: 'total_power', label: 'Leistung', legend: 'Installierte Leistung', unit: 'MW', digits: 1 },
  { id: 'relative_population_power', label: 'je Einwohner', legend: 'Leistung je Einwohner', unit: 'kW/Einw.', digits: 2 },
  { id: 'relative_area_power', label: 'je km²', legend: 'Leistung je Fläche', unit: 'kW/km²', digits: 0 },
  { id: 'added_12m_power', label: 'Zubau 12 Monate', legend: 'Zubau der letzten 12 Monate', unit: 'MW', digits: 1 },
  { id: 'total_units', label: 'Anlagen', legend: 'Anlagen in Betrieb', unit: 'Anlagen', digits: 0 },
];
// The two Anlagenarten of solar, in the composition and stacked in the timeline (Gebäude at the bottom)
const ANLAGENARTEN = [
  { id: 'gebaeude', label: 'Gebäude', color: 'var(--series-solar)' },
  { id: 'freiflaeche', label: 'Freifläche', color: 'var(--series-freiflaeche)' },
];

const subtypesOf = (series) => series.map((s) => s.id);
const times = (ratio) => `${ratio >= 10 ? formatNumber(ratio, 0) : formatFixed(ratio, 1)}×`;
const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
// Rank by a field among peers, the largest first: "3 von 33"
function rankOf(peers, row, field) {
  const larger = peers.filter((peer) => (peer[field] ?? 0) > (row[field] ?? 0)).length;
  return `${larger + 1} von ${peers.length}`;
}

// ------------------------------------------------------------------------------------------------------------- finder

/**
 * Without a Kreis: find one by name, a Kreis or a Gemeinde (all of Germany), or pick a Kreis of the chosen Land. The
 * lists load when the search is first used.
 */
function KommuneFinder({ state, onPick }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(false);
  const kreise = useTopology(active ? KREISE_TOPOLOGY : null);
  const gemeinden = useJson(active ? `${API_BASE_URL}/regions/areas?level=gemeinde` : null);

  const entries = useMemo(() => {
    const kreisNames = new Map((kreise.data?.features ?? []).map((f) => [f.properties.ags, f.properties.name]));
    const ofKreise = [...kreisNames].filter(([ags]) => isKreisKey(ags)).map(([ags, name]) => ({
      ags,
      name,
      kind: 'Landkreis',
      context: findBundeslandByAgs(ags.slice(0, 2))?.name,
    }));
    const ofGemeinden = (gemeinden.data ?? []).map((row) => ({
      ags: row.region,
      name: row.name,
      kind: 'Gemeinde',
      context: kreisNames.get(row.region.slice(0, 5)),
      einwohner: row.einwohner,
    }));
    return [...ofKreise, ...ofGemeinden];
  }, [kreise.data, gemeinden.data]);

  const needle = query.trim().toLocaleLowerCase('de');
  const matches = useMemo(() => {
    if (needle.length < 2) return [];
    const scored = entries.flatMap((e) => {
      const name = e.name.toLocaleLowerCase('de');
      const at = name.indexOf(needle);
      if (at < 0) return [];
      // Names that start with it first, Kreise before Gemeinden, larger Gemeinden first
      return [{ e, score: (at === 0 ? 0 : 2) + (e.kind === 'Landkreis' ? 0 : 1) - Math.min(0.9, (e.einwohner ?? 0) / 1e6) }];
    });
    return scored.sort((a, b) => a.score - b.score).slice(0, 12).map((s) => s.e);
  }, [entries, needle]);
  const loading = active && (kreise.status === 'loading' || gemeinden.status === 'loading');

  return (
    <section className="card kommune-finder" aria-labelledby="kommune-finder-title">
      <div className="kommune-finder__head">
        <span className="kommune-finder__icon" aria-hidden="true">
          <Search size={20} />
        </span>
        <div>
          <h2 id="kommune-finder-title" className="kommune-finder__title">
            Landkreis oder Gemeinde finden
          </h2>
          <p className="kommune-finder__lead">
            Solaranlagen eines Landkreises und seiner Gemeinden: auf der Karte, in Kennzahlen mit Rang und Vergleich, im Zubau je
            Jahr.
          </p>
        </div>
      </div>
      <label className="visually-hidden" htmlFor="kommune-search">
        Landkreis oder Gemeinde
      </label>
      <input
        id="kommune-search"
        className="kommune-finder__input"
        type="search"
        autoComplete="off"
        placeholder="z. B. Zwickau, Landkreis Harz, Bernau …"
        value={query}
        onFocus={() => setActive(true)}
        onChange={(e) => {
          setActive(true);
          setQuery(e.target.value);
        }}
      />
      {loading && <p className="kommune-finder__hint">Lade die Namen …</p>}
      {matches.length > 0 && (
        <ul className="kommune-finder__results">
          {matches.map((m) => (
            <li key={m.ags}>
              <button type="button" className="kommune-finder__result" onClick={() => onPick(m.ags)}>
                <span className="kommune-finder__name">{m.name}</span>
                <span className="kommune-finder__kind">
                  {m.kind}
                  {m.context && ` · ${m.context}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {needle.length >= 2 && !loading && !matches.length && <p className="kommune-finder__hint">Kein Landkreis und keine Gemeinde mit „{query}“.</p>}

      {state.region && state.kreisOptions && (
        <div className="kommune-finder__kreise">
          <h3 className="kommune-finder__subtitle">Landkreise in {state.region.name}</h3>
          <ul>
            {state.kreisOptions.map((k) => (
              <li key={k.ags}>
                <button type="button" className="kommune-finder__kreis" onClick={() => onPick(k.ags)}>
                  {k.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!state.region && (
        <div className="kommune-finder__kreise">
          <h3 className="kommune-finder__subtitle">Oder erst ein Land</h3>
          <ul>
            {BUNDESLAENDER.map((b) => (
              <li key={b.code}>
                <button type="button" className="kommune-finder__kreis" onClick={() => state.selectScope(b.code)}>
                  {b.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// -------------------------------------------------------------------------------------------------------------- panel

// One figure of the panel: its value, how it compares, its rank
function Figure({ label, value, compare, rank }) {
  return (
    <div className="kommune-figure">
      <dt>{label}</dt>
      <dd className="kommune-figure__value">{value}</dd>
      {(compare || rank) && (
        <dd className="kommune-figure__meta">
          {compare && <span>{compare}</span>}
          {rank && <span className="kommune-figure__rank">{rank}</span>}
        </dd>
      )}
    </div>
  );
}

/**
 * Left of the map: the Kreis or the picked Gemeinde in figures – each compared with the whole it lies in and ranked
 * among its peers –, how its power splits into Gebäude and Freifläche, and (for the Kreis) its largest Gemeinden.
 */
function KommunePanel({ scope, row, split, peers, parentRow, parentLabel, nationalRow, largest, onSelect, onBack, leistungLabel }) {
  if (!row) {
    return (
      <aside className="card kommune-panel">
        <p className="kommune-panel__state">{scope.loading ? 'Wird geladen …' : `Keine Solaranlagen in ${scope.name}.`}</p>
      </aside>
    );
  }
  const compare = (field) => {
    const parts = [];
    if (parentRow?.[field]) parts.push(`${times(row[field] / parentRow[field])} ${parentLabel}`);
    if (nationalRow?.[field]) parts.push(`${times(row[field] / nationalRow[field])} Bundesschnitt`);
    return parts.join(' · ');
  };
  const growth = row.total_power ? row.added_12m_power / (row.total_power - row.added_12m_power) : 0;
  const shareOfParent = parentRow?.total_power ? row.total_power / parentRow.total_power : null;

  return (
    <aside className="card kommune-panel" aria-label={`${scope.name} in Zahlen`}>
      <header className="kommune-panel__head">
        {onBack && (
          <button type="button" className="kommune-panel__back" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> {scope.parentName}
          </button>
        )}
        <span className="kommune-panel__eyebrow">{scope.kindLabel}</span>
        <h2 className="kommune-panel__title">{scope.name}</h2>
        <span className="kommune-panel__what">
          <Sun size={13} aria-hidden="true" /> Solar · {leistungLabel}
        </span>
      </header>

      <dl className="kommune-panel__figures">
        <Figure
          label="Installierte Leistung"
          value={formatAmount(row.total_power, 'MW')}
          compare={shareOfParent != null ? `${formatPercent(shareOfParent)} von ${scope.parentName}` : ''}
          rank={peers ? `Rang ${rankOf(peers.rows, row, 'total_power')} ${peers.label}` : ''}
        />
        <Figure label="Anlagen in Betrieb" value={formatNumber(row.total_units)} rank={peers ? `Rang ${rankOf(peers.rows, row, 'total_units')}` : ''} />
        <Figure
          label="Leistung je Einwohner"
          value={`${formatNumber(row.relative_population_power, 2)} kW`}
          compare={compare('relative_population_power')}
          rank={peers ? `Rang ${rankOf(peers.rows, row, 'relative_population_power')}` : ''}
        />
        <Figure
          label="Leistung je km²"
          value={`${formatNumber(row.relative_area_power, 0)} kW`}
          compare={compare('relative_area_power')}
          rank={peers ? `Rang ${rankOf(peers.rows, row, 'relative_area_power')}` : ''}
        />
        <Figure
          label="Zubau der letzten 12 Monate"
          value={formatAmount(row.added_12m_power, 'MW')}
          compare={growth > 0 ? `+${formatPercent(growth)} auf den Bestand davor` : ''}
        />
      </dl>

      {split && (
        <div className="kommune-split">
          <h3 className="kommune-panel__subtitle">Gebäude und Freifläche</h3>
          <div className="kommune-split__bar" role="img" aria-label={split.map((s) => `${s.label} ${formatAmount(s.power, 'MW')}`).join(', ')}>
            {split.map((s) =>
              s.share > 0 ? <span key={s.id} style={{ width: `${s.share * 100}%`, background: s.color }} title={`${s.label}: ${formatAmount(s.power, 'MW')}`} /> : null,
            )}
          </div>
          <ul className="kommune-split__legend">
            {split.map((s) => (
              <li key={s.id}>
                <span className="kommune-split__dot" style={{ background: s.color }} />
                {s.label} <strong>{formatAmount(s.power, 'MW')}</strong> · {formatPercent(s.share)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {largest && largest.length > 0 && (
        <div className="kommune-largest">
          <h3 className="kommune-panel__subtitle">Größte Gemeinden nach Leistung</h3>
          <ol>
            {largest.map((g) => (
              <li key={g.ags}>
                <button type="button" onClick={() => onSelect(g.ags)}>
                  <span className="kommune-largest__name">{g.name}</span>
                  <span className="kommune-largest__bar" aria-hidden="true">
                    <span style={{ width: `${(g.total_power / largest[0].total_power) * 100}%` }} />
                  </span>
                  <span className="kommune-largest__value">{formatAmount(g.total_power, 'MW')}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
}

// ----------------------------------------------------------------------------------------------------------- timeline

const MEASURES = [
  { id: 'zubau', label: 'Zubau' },
  { id: 'bestand', label: 'Bestand' },
];
const STYLES = [
  { id: 'balken', label: 'Balken' },
  { id: 'kurve', label: 'Kurve' },
];

// Zubau and Bestand per year in the Kreis or Gemeinde, Gebäude and Freifläche stacked (mrt.solar_zubau_regions)
function RegionTimeline({ scopeKey, scopeName, query, subtypes, leistungLabel }) {
  const data = useJson(`${API_BASE_URL}/solar/zubau?region=${scopeKey}${query ? `&${query}` : ''}`);
  const [measure, setMeasure] = useState('zubau');
  const [style, setStyle] = useState('kurve');
  const bestand = measure === 'bestand';
  const series = ANLAGENARTEN.filter((a) => subtypes.includes(a.id));

  // Small Gemeinden in kW: "350 kW" reads better than "0,35 MW"
  const { periods, unit } = useMemo(() => {
    if (!data.data?.length) return { periods: [], unit: 'MW' };
    const field = bestand ? 'installed' : 'added';
    const years = [...new Set(data.data.map((row) => row.year))].sort((a, b) => a - b);
    const totals = years.map((year) => data.data.filter((row) => row.year === year && subtypesOf(series).includes(row.anlagenart)).reduce((t, row) => t + row[field], 0));
    const factor = Math.max(...totals) < 1 ? 1000 : 1;
    const last = years.at(-1);
    return {
      unit: factor === 1000 ? 'kW' : 'MW',
      periods: years.map((year) => {
        const rows = data.data.filter((row) => row.year === year);
        const current = year === last;
        return {
          key: String(year),
          tick: String(year),
          label: bestand ? (current ? `${year} (aktueller Stand)` : `Ende ${year}`) : current ? `${year} (laufendes Jahr)` : String(year),
          partial: current,
          values: Object.fromEntries(series.map((s) => [s.id, (rows.find((row) => row.anlagenart === s.id)?.[field] ?? 0) * factor])),
        };
      }),
    };
  }, [data.data, bestand, series]);

  return (
    <AnalysisPanel
      id="analyse-zeitverlauf"
      icon={ChartColumnIncreasing}
      title={`Zubau und Bestand · ${scopeName}`}
      lead={bestand ? `Installierte Solarleistung am Jahresende · ${leistungLabel}` : `Neu in Betrieb genommene Solarleistung je Jahr · ${leistungLabel}`}
      className="timeline-card"
    >
      <div className="timeline__controls">
        <SegmentedControl label="Größe" options={MEASURES} value={measure} onChange={setMeasure} />
        <SegmentedControl
          label="Darstellung"
          options={STYLES}
          value={bestand ? style : 'balken'}
          onChange={setStyle}
          disabled={!bestand}
          hint="Als Kurve: der Bestand"
        />
      </div>
      {data.status === 'error' ? (
        <ChartPlaceholder variant="bars" title="Keine Daten" note="Der Zeitverlauf konnte nicht geladen werden." />
      ) : !data.data ? (
        <ChartPlaceholder variant="bars" title="Wird geladen …" />
      ) : (
        <StackedChart
          periods={periods}
          series={series}
          kind={bestand && style === 'kurve' ? 'area' : 'bars'}
          unit={unit}
          label={`Solar in ${scopeName}: ${bestand ? 'Bestand am Jahresende' : 'Zubau je Jahr'}`}
        />
      )}
      <div className="timeline-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.id} className="timeline-legend__item is-static">
            <span className="timeline-legend__dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <p className="timeline__note">
        Nach Inbetriebnahmedatum, Quelle: Marktstammdatenregister. Bestand: in Betrieb am Jahresende, endgültig stillgelegte
        Anlagen abgezogen; Anlagen vor 2000 zählen in den Bestand. Hell: laufendes Jahr, das noch wächst, auch weil Anlagen oft
        erst Wochen nach der Inbetriebnahme registriert werden.
      </p>
    </AnalysisPanel>
  );
}

// -------------------------------------------------------------------------------------------------------------- table

const COLUMNS = [
  { id: 'name', label: 'Gemeinde', text: true },
  { id: 'einwohner', label: 'Einwohner', format: (v) => formatNumber(v) },
  { id: 'total_units', label: 'Anlagen', format: (v) => formatNumber(v) },
  { id: 'total_power', label: 'Leistung (MW)', format: (v) => formatFixed(v, 1), bar: true },
  { id: 'relative_population_power', label: 'je Einw. (kW)', format: (v) => formatFixed(v, 2) },
  { id: 'relative_area_power', label: 'je km² (kW)', format: (v) => formatNumber(v, 0) },
  { id: 'added_12m_power', label: 'Zubau 12 Mon. (MW)', format: (v) => formatFixed(v, 1) },
  { id: 'share', label: 'Anteil am Kreis', format: (v) => formatPercent(v) },
];

// Every Gemeinde of the Kreis, sortable by each column; a row picks its Gemeinde
function GemeindenTable({ rows, kreisName, selected, onSelect, fileBase }) {
  const [sort, setSort] = useState({ id: 'total_power', desc: true });
  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.id === sort.id);
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) =>
      column.text ? dir * a.name.localeCompare(b.name, 'de') : dir * ((a[sort.id] ?? -Infinity) - (b[sort.id] ?? -Infinity)),
    );
  }, [rows, sort]);
  const maxPower = Math.max(...rows.map((r) => r.total_power ?? 0), 0);

  return (
    <AnalysisPanel
      id="analyse-gemeinden"
      icon={Search}
      title={`Gemeinden in ${kreisName}`}
      lead={`${rows.length} Gemeinden · Klick auf eine Zeile zeigt sie auf der Karte und im Steckbrief`}
      tools={
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() =>
            exportCsv(
              sorted.map((r) => ({
                gemeindeschluessel: r.ags,
                gemeinde: r.name,
                einwohner: r.einwohner,
                anlagen: r.total_units,
                leistung_mw: r.total_power,
                leistung_je_einwohner_kw: r.relative_population_power,
                leistung_je_km2_kw: r.relative_area_power,
                zubau_12_monate_mw: r.added_12m_power,
              })),
              fileBase,
            )
          }
        >
          <Download size={14} aria-hidden="true" /> CSV
        </button>
      }
    >
      <div className="kommune-table__scroll">
        <table className="kommune-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.id === c.id;
                return (
                  <th key={c.id} scope="col" aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined} className={c.text ? 'is-text' : undefined}>
                    <button type="button" onClick={() => setSort({ id: c.id, desc: active ? !sort.desc : !c.text })}>
                      {c.label}
                      {active && (sort.desc ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.ags} className={r.ags === selected ? 'is-selected' : undefined} onClick={() => onSelect(r.ags === selected ? null : r.ags)}>
                {COLUMNS.map((c) =>
                  c.text ? (
                    <th key={c.id} scope="row">
                      <button type="button" className="kommune-table__name" onClick={(e) => {
                        e.stopPropagation();
                        onSelect(r.ags === selected ? null : r.ags);
                      }}>
                        {r.name}
                      </button>
                    </th>
                  ) : (
                    <td key={c.id}>
                      {c.bar && maxPower > 0 && (
                        <span className="kommune-table__bar" aria-hidden="true" style={{ width: `${((r.total_power ?? 0) / maxPower) * 100}%` }} />
                      )}
                      <span className="kommune-table__value">{r[c.id] == null ? '—' : c.format(r[c.id])}</span>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalysisPanel>
  );
}

// --------------------------------------------------------------------------------------------------------------- page

/**
 * The page "Landkreis/Gemeinde" of the Erzeuger: one Landkreis and its Gemeinden in depth, for now for solar – on a
 * detailed map with a background map, in figures with rank and comparison, Zubau and Bestand per year, orientation and
 * size classes, and every Gemeinde in a table. Picking a Gemeinde (map, table, list, scope bar) narrows everything to it.
 */
export default function KommuneView({ config, state }) {
  const { region, kreisAgs, kreisFeature, kreisName, gemeindeAgs, kreise, searchParams, setParam } = state;
  const solar = config.technologies.find((t) => t.id === 'solar');
  const selection = selectionOf(solar, searchParams);
  const { query } = selection;
  const leistungLabel = selection.leistung.label;
  const both = selection.subtypes.length === solar.subtypes.options.length;
  // The Freifläche alone, in the chosen Leistung: Gebäude is the rest
  const freiflaecheQuery = ['anlagenart=freiflaeche', selection.leistung.id !== solar.leistung.options[0].id && `leistung=${selection.leistung.id}`]
    .filter(Boolean)
    .join('&');

  const [metricId, setMetricId] = useState('total_power');
  const metric = METRICS.find((m) => m.id === metricId);
  // The background map, and how strongly the shading covers it: each map comes with its own, the slider changes it
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP);
  const [opacity, setOpacity] = useState(() => BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP).fillOpacity);
  const chooseBasemap = (id) => {
    setBasemap(id);
    setOpacity(BASEMAPS.find((b) => b.id === id).fillOpacity);
  };

  // ------------------------------------------------------------------------------------------------------- data
  const gemeindeStats = useStats(kreisAgs ? statsUrl(solar.statsPath, 'gemeinde', query) : null);
  const kreisStats = useStats(kreisAgs ? statsUrl(solar.statsPath, 'landkreis', query) : null);
  const landStats = useStats(kreisAgs ? statsUrl(solar.statsPath, 'bundesland', query) : null);
  const gemeindeFF = useStats(kreisAgs && both ? statsUrl(solar.statsPath, 'gemeinde', freiflaecheQuery) : null);
  const kreisFF = useStats(kreisAgs && both ? statsUrl(solar.statsPath, 'landkreis', freiflaecheQuery) : null);
  const areas = useJson(kreisAgs ? `${API_BASE_URL}/regions/areas?level=gemeinde&within=${kreisAgs}` : null);
  const areasLand = useJson(kreisAgs ? `${API_BASE_URL}/regions/areas?level=bundesland` : null);
  const shapes = useTopology(kreisAgs ? GEMEINDEN_TOPOLOGY : null);

  // The Gemeinden of the Kreis: shape, name, area and population, values
  const gemeinden = useMemo(() => {
    if (!kreisAgs || !shapes.data || !areas.data) return null;
    const statsOf = new Map((gemeindeStats.data ?? []).map((row) => [row.gemeinde, row]));
    const areaOf = new Map(areas.data.map((row) => [row.region, row]));
    return {
      type: 'FeatureCollection',
      features: shapes.data.features
        .filter((f) => f.properties.ags.startsWith(kreisAgs))
        .map((f) => {
          const row = statsOf.get(f.properties.ags);
          const area = areaOf.get(f.properties.ags);
          return {
            ...f,
            properties: { ...f.properties, ...row, name: area?.name ?? f.properties.name, einwohner: area?.einwohner, qkm: area?.qkm, _hasData: Boolean(row) },
          };
        }),
    };
  }, [kreisAgs, shapes.data, areas.data, gemeindeStats.data]);

  // Where to write each name, the most populous first; computed once per Kreis
  const labels = useMemo(
    () =>
      gemeinden?.features
        .map((f) => {
          const [lon, lat] = labelPoint(f.geometry);
          return { ags: f.properties.ags, name: f.properties.name, lon, lat, einwohner: f.properties.einwohner ?? 0 };
        })
        .sort((a, b) => b.einwohner - a.einwohner) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shapes and names, not the values, decide the points
    [shapes.data, kreisAgs, areas.data],
  );

  // The Kreise around it, as thin outlines: those whose box reaches into the Kreis's box, widened by half
  const neighbours = useMemo(() => {
    if (!kreisFeature || !kreise.data) return null;
    const [w, s, e, n] = bboxOf(kreisFeature.geometry);
    const [dx, dy] = [(e - w) / 2, (n - s) / 2];
    const around = [w - dx, s - dy, e + dx, n + dy];
    return {
      type: 'FeatureCollection',
      features: kreise.data.features.filter((f) => {
        if (f.properties.ags === kreisAgs || !isKreisKey(f.properties.ags)) return false;
        const [fw, fs, fe, fn] = bboxOf(f.geometry);
        return fw < around[2] && fe > around[0] && fs < around[3] && fn > around[1];
      }),
    };
  }, [kreisFeature, kreise.data, kreisAgs]);

  const scale = useMemo(() => {
    const values = gemeinden ? gemeinden.features.filter((f) => f.properties._hasData).map((f) => f.properties[metric.id] ?? 0) : [];
    const max = scaleDomainMax(values);
    return { colorFor: makeColorScale(config.ramp, max), max, clipped: values.some((v) => v > max) };
  }, [gemeinden, metric.id, config.ramp]);

  // The rows of the table and the panel: one per Gemeinde, with its share of the Kreis
  const kreisRow = kreisStats.data?.find((row) => row.landkreis === kreisAgs) ?? null;
  const gemeindeRows = useMemo(
    () =>
      gemeinden?.features.map((f) => ({
        ...f.properties,
        share: kreisRow?.total_power ? (f.properties.total_power ?? 0) / kreisRow.total_power : null,
      })) ?? [],
    [gemeinden, kreisRow],
  );

  // Averages of the Land and of Germany, per inhabitant and per km² (the Länder's sums over their areas)
  const landRow = landStats.data?.find((row) => row.bundesland === region?.ags) ?? null;
  const nationalRow = useMemo(() => {
    if (!landStats.data || !areasLand.data) return null;
    const lands = landStats.data.filter((row) => findBundeslandByAgs(row.bundesland));
    const power = sum(lands, 'total_power');
    const einwohner = sum(areasLand.data, 'einwohner');
    const qkm = sum(areasLand.data, 'qkm');
    return { total_power: power, relative_population_power: (1000 * power) / einwohner, relative_area_power: (1000 * power) / qkm };
  }, [landStats.data, areasLand.data]);

  const selectGemeinde = state.selectGemeinde;
  const gemeinde = gemeindeAgs ? gemeindeRows.find((r) => r.ags === gemeindeAgs) ?? null : null;
  const peersInLand = useMemo(
    () => (kreisStats.data && region ? kreisStats.data.filter((row) => isKreisKey(row.landkreis) && row.landkreis.startsWith(region.ags)) : null),
    [kreisStats.data, region],
  );
  const withData = gemeindeRows.filter((r) => r._hasData);

  // The figures of the panel: of the Gemeinde (among the Gemeinden of the Kreis, against the Kreis) or of the Kreis
  // (among the Kreise of the Land, against the Land)
  const panel = gemeindeAgs
    ? {
        scope: { name: gemeinde?.name ?? state.scopeName, kindLabel: `Gemeinde · ${kreisName}`, parentName: kreisName, loading: !gemeinden },
        row: gemeinde?._hasData ? gemeinde : null,
        peers: { rows: withData, label: 'im Kreis' },
        parentRow: kreisRow,
        parentLabel: 'Kreisschnitt',
        onBack: () => selectGemeinde(null),
      }
    : {
        scope: { name: kreisName, kindLabel: `Landkreis · ${region?.name}`, parentName: region?.name, loading: kreisStats.status !== 'ready' },
        row: kreisRow,
        peers: peersInLand && { rows: peersInLand, label: `in ${region.name}` },
        parentRow: landRow,
        parentLabel: 'Landesschnitt',
        largest: [...withData].sort((a, b) => (b.total_power ?? 0) - (a.total_power ?? 0)).slice(0, 6),
      };

  // Gebäude and Freifläche of the panel's area, where both are chosen
  const split = useMemo(() => {
    const row = panel.row;
    if (!both || !row) return null;
    const ffRows = gemeindeAgs ? gemeindeFF.data : kreisFF.data;
    if (!ffRows) return null;
    const ff = ffRows.find((r) => (gemeindeAgs ? r.gemeinde === gemeindeAgs : r.landkreis === kreisAgs))?.total_power ?? 0;
    const total = row.total_power || 0;
    if (!total) return null;
    return [
      { ...ANLAGENARTEN[0], power: total - ff, share: (total - ff) / total },
      { ...ANLAGENARTEN[1], power: ff, share: ff / total },
    ];
  }, [panel.row, both, gemeindeAgs, gemeindeFF.data, kreisFF.data, kreisAgs]);

  const tooltipFor = useCallback(
    (f) => {
      const p = f.properties;
      const rows = p._hasData
        ? METRICS.map(
            (m) =>
              `<tr${m.id === metric.id ? ' class="is-active"' : ''}><th>${m.label}</th><td>${formatNumber(p[m.id], m.digits)}</td><td>${m.unit === 'Anlagen' ? '' : m.unit}</td></tr>`,
          ).join('')
        : '<tr><td class="map-tooltip__empty" colspan="3">Keine Solaranlagen</td></tr>';
      const hint = p.ags === gemeindeAgs ? 'Klicken: zurück zum Landkreis' : 'Klicken: Steckbrief der Gemeinde';
      return `<div class="map-tooltip__title">${escapeHtml(p.name)}</div><table>${rows}</table><div class="map-tooltip__hint">${hint}</div>`;
    },
    [metric.id, gemeindeAgs],
  );

  // A Kreis or Gemeinde from the finder: its Land, Kreis and Gemeinde in the address
  const onPick = useCallback(
    (ags) => {
      const land = findBundeslandByAgs(ags.slice(0, 2));
      if (land) state.selectScope(land.code, ags.slice(0, 5), ags.length === 8 ? ags : null);
    },
    [state],
  );

  const scopeBar = (
    <ScopeBar
      region={region}
      kreis={kreisAgs}
      kreisOptions={state.kreisOptions}
      onSelectScope={state.selectScope}
      gemeinde={gemeindeAgs}
      gemeindeOptions={state.gemeindeOptions}
      onSelectGemeinde={selectGemeinde}
    />
  );

  if (!kreisAgs) {
    return (
      <>
        {scopeBar}
        <KommuneFinder state={state} onPick={onPick} />
      </>
    );
  }

  const mapStatus = [shapes, gemeindeStats, areas].some((r) => r.status === 'error') ? 'error' : gemeinden && gemeindeStats.status === 'ready' ? 'ready' : 'loading';
  const filtersSolar = {
    subtypes: selection.subtypes,
    onSubtypes: (ids) => setParam(solar.subtypes.param, ids.join(','), solar.subtypes.options.map((o) => o.id).join(',')),
    leistung: selection.leistung,
    onLeistung: (id) => setParam(solar.leistung.param, id, solar.leistung.options[0].id),
  };

  return (
    <>
      {scopeBar}
      <section className="card kommune-toolbar" aria-label="Auswahl">
        <TechFilters technology={solar} {...filtersSolar} />
        <p className="kommune-toolbar__note">Bisher für Solaranlagen; Wind, Wasserkraft und Speicher folgen.</p>
      </section>

      <div className="kommune">
        <KommunePanel {...panel} split={split} onSelect={selectGemeinde} leistungLabel={leistungLabel} nationalRow={nationalRow} />

        <section className="card kommune-map-card" aria-label={`Karte von ${kreisName}`}>
          <header className="kommune-map-card__head">
            <div>
              <h2 className="card__title">
                {metric.legend} · {leistungLabel}
              </h2>
              <div className="card__subtitle">Gemeinden in {kreisName}</div>
            </div>
            <div className="kommune-map-card__tools">
              <label className="kommune-map-card__field">
                <span>Kennzahl</span>
                <select className="timeline__select" value={metric.id} onChange={(e) => setMetricId(e.target.value)}>
                  {METRICS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="kommune-map-card__field">
                <span>Deckkraft</span>
                <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
              </label>
            </div>
          </header>
          <div className="map-frame kommune-map-frame">
            <KommuneMap
              gemeinden={gemeinden}
              dataKey={`${kreisAgs}-${metric.id}-${query}-${gemeindeStats.status}`}
              kreis={kreisFeature}
              neighbours={neighbours}
              labels={labels}
              valueKey={metric.id}
              colorFor={scale.colorFor}
              selected={gemeindeAgs}
              onSelect={selectGemeinde}
              tooltipFor={tooltipFor}
              basemap={basemap}
              opacity={opacity}
              onBasemap={chooseBasemap}
            >
              {mapStatus === 'ready' && <MapLegend title={metric.legend} unit={metric.unit === 'Anlagen' ? '' : metric.unit} ramp={config.ramp} max={scale.max} clipped={scale.clipped} />}
              {mapStatus === 'loading' && (
                <div className="map-overlay map-overlay--loading" role="status">
                  <div className="spinner" />
                  <span>Lade Karte …</span>
                </div>
              )}
              {mapStatus === 'error' && (
                <div className="map-overlay">
                  <div className="state-message state-message--error" role="alert">
                    <div className="state-message__title">Die Karte konnte nicht geladen werden</div>
                  </div>
                </div>
              )}
            </KommuneMap>
          </div>
          <footer className="map-card__footer">
            <span>Quelle: Marktstammdatenregister (BNetzA) · Strg/⌘ + Mausrad zum Zoomen · Klick auf eine Gemeinde: ihr Steckbrief</span>
            <span className="map-card__credit">Grenzen und Einwohner: © GeoBasis-DE / BKG (2025), dl-de/by-2-0, Daten verändert</span>
          </footer>
        </section>
      </div>

      <RegionTimeline scopeKey={state.scopeKey} scopeName={state.scopeName} query={query} subtypes={selection.subtypes} leistungLabel={leistungLabel} />

      <div className="analyses-grid analyses-grid--pairs">
        <article className="card">
          <header className="card__header">
            <div>
              <h3 className="card__title">Ausrichtung · {state.scopeName}</h3>
              <div className="card__subtitle">Leistung nach Hauptausrichtung der Module</div>
            </div>
          </header>
          <div className="card__body">
            <OrientationRose key={state.scopeKey} path="/solar/orientation" region={state.scopeKey} query={query} />
          </div>
        </article>
        <article className="card">
          <header className="card__header">
            <div>
              <h3 className="card__title">Anlagengröße · {state.scopeName}</h3>
              <div className="card__subtitle">Anteile an Leistung und Anlagen je Leistungsklasse</div>
            </div>
          </header>
          <div className="card__body">
            <SizeDistribution key={state.scopeKey} path={solar.sizesPath} region={state.scopeKey} query={query} />
          </div>
        </article>
      </div>

      {gemeindeRows.length > 0 && (
        <GemeindenTable rows={gemeindeRows} kreisName={kreisName} selected={gemeindeAgs} onSelect={selectGemeinde} fileBase={`mastr_solar_gemeinden_${kreisAgs}`} />
      )}
    </>
  );
}
