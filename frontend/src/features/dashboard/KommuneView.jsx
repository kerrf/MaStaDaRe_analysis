import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, ChartColumnIncreasing, Download, Search } from 'lucide-react';
import AggregateControl from '../../components/charts/AggregateControl';
import StackedChart from '../../components/charts/StackedChart';
import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import CsvLink, { ChartFoot } from '../../components/ui/CsvLink';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { BASEMAPS, DEFAULT_BASEMAP } from '../../config/basemaps';
import { GRANULARITIES } from '../../config/dashboards';
import { KOMMUNE } from '../../config/kommune';
import { BUNDESLAENDER, findBundeslandByAgs, isKreisKey } from '../../config/regions';
import { API_BASE_URL } from '../../config/site';
import { makeColorScale, scaleDomainMax } from '../../lib/colorScale';
import { statsUrl, useJson, useStats, useTopology } from '../../lib/data';
import { exportCsv, fileName, round, selectionSlug } from '../../lib/files';
import { escapeHtml, formatFixed, formatNumber, formatPercent } from '../../lib/format';
import { bboxOf, labelPoint } from '../../lib/geometry';
import AnalysisPanel from './AnalysisPanel';
import KommuneMap from './KommuneMap';
import KommuneStorage from './KommuneStorage';
import KommuneTargets from './KommuneTargets';
import MapLegend from './MapLegend';
import OrientationRose from './OrientationRose';
import ScopeBar from './ScopeBar';
import SizeDistribution from './SizeDistribution';
import TechFilters from './TechFilters';
import { selectionOf } from './useDashboardState';

const GEMEINDEN_TOPOLOGY = GRANULARITIES.find((g) => g.id === 'gemeinde').topology;
const KREISE_TOPOLOGY = GRANULARITIES.find((g) => g.id === 'landkreis').topology;

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
 * lists load when the search is first used. lead: what the page shows, from its profile
 */
function KommuneFinder({ state, onPick, lead }) {
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
          <p className="kommune-finder__lead">{lead}</p>
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
 * Left of the map: the Kreis or the picked Gemeinde in the profile's figures – each compared with the whole it lies in
 * and ranked among its peers –, how its size splits into its kinds, and (for the Kreis) its largest Gemeinden.
 */
function KommunePanel({ profile, what, scope, row, split, peers, parentRow, parentLabel, nationalRow, largest, onSelect, onBack }) {
  const Icon = profile.icon;
  if (!row) {
    return (
      <aside className="card kommune-panel">
        <p className="kommune-panel__state">{scope.loading ? 'Wird geladen …' : `Keine ${profile.noun} in ${scope.name}.`}</p>
      </aside>
    );
  }
  const compare = (field) => {
    const parts = [];
    if (parentRow?.[field]) parts.push(`${times(row[field] / parentRow[field])} ${parentLabel}`);
    if (nationalRow?.[field]) parts.push(`${times(row[field] / nationalRow[field])} Bundesschnitt`);
    return parts.join(' · ');
  };
  const metaOf = (figure) => {
    if (figure.share) return parentRow?.[figure.field] ? `${formatPercent(row[figure.field] / parentRow[figure.field])} von ${scope.parentName}` : '';
    if (figure.compare) return compare(figure.field);
    if (figure.growthOf) {
      const before = (row[figure.growthOf] ?? 0) - (row[figure.field] ?? 0);
      return before > 0 && row[figure.field] > 0 ? `+${formatPercent(row[figure.field] / before)} auf den Bestand davor` : '';
    }
    return '';
  };
  const size = profile.size;

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
          <Icon size={13} aria-hidden="true" /> {what}
        </span>
      </header>

      <dl className="kommune-panel__figures">
        {profile.figures.map((figure, i) => (
          <Figure
            key={figure.field}
            label={figure.label}
            value={figure.format(row[figure.field] ?? 0)}
            compare={metaOf(figure)}
            rank={figure.rank && peers ? `Rang ${rankOf(peers.rows, row, figure.field)}${i === 0 ? ` ${peers.label}` : ''}` : ''}
          />
        ))}
      </dl>

      {split && (
        <div className="kommune-split">
          <h3 className="kommune-panel__subtitle">{profile.split.title}</h3>
          <div className="kommune-split__bar" role="img" aria-label={split.map((s) => `${s.label} ${size.format(s.value)}`).join(', ')}>
            {split.map((s) =>
              s.share > 0 ? <span key={s.id} style={{ width: `${s.share * 100}%`, background: s.color }} title={`${s.label}: ${size.format(s.value)}`} /> : null,
            )}
          </div>
          <ul className="kommune-split__legend">
            {split.map((s) => (
              <li key={s.id}>
                <span className="kommune-split__dot" style={{ background: s.color }} />
                {s.label} <strong>{size.format(s.value)}</strong> · {formatPercent(s.share)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {largest && largest.length > 0 && (
        <div className="kommune-largest">
          <h3 className="kommune-panel__subtitle">Größte Gemeinden nach {profile.figures[0].label}</h3>
          <ol>
            {largest.map((g) => (
              <li key={g.ags}>
                <button type="button" onClick={() => onSelect(g.ags)}>
                  <span className="kommune-largest__name">{g.name}</span>
                  <span className="kommune-largest__bar" aria-hidden="true">
                    <span style={{ width: `${((g[size.field] ?? 0) / (largest[0][size.field] || 1)) * 100}%` }} />
                  </span>
                  <span className="kommune-largest__value">{size.format(g[size.field] ?? 0)}</span>
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

// Small areas in the next smaller unit: "350 kW" reads better than "0,35 MW"
const SMALLER = { MW: 'kW', MWh: 'kWh' };

/**
 * Zubau and Bestand per year in the Kreis or Gemeinde, the profile's series stacked (Solar: Gebäude and Freifläche,
 * mrt.solar_zubau_regions; batteries: the size classes, mrt.battery_zubau_regions), in one of its measures.
 * query: the page's selection, for a timeline withSelection; series: the ones to show; fileBase: of its CSV
 */
function RegionTimeline({ timeline, scopeKey, scopeName, query, series, selectionLabel, fileBase }) {
  const data = useJson(`${API_BASE_URL}${timeline.path}?region=${scopeKey}${timeline.withSelection && query ? `&${query}` : ''}`);
  // Aggregiert: the Bestand at each year's end instead of the Zubau per year
  const [aggregiert, setAggregiert] = useState(false);
  const [style, setStyle] = useState('kurve');
  const view = aggregiert ? 'bestand' : 'zubau';
  const [measureId, setMeasureId] = useState(timeline.measures[0].id);
  const measure = timeline.measures.find((m) => m.id === measureId) ?? timeline.measures[0];
  const bestand = view === 'bestand';

  const { periods, unit } = useMemo(() => {
    if (!data.data?.length) return { periods: [], unit: measure.unit };
    const field = bestand ? measure.installed : measure.added;
    const ids = series.map((s) => s.id);
    const years = [...new Set(data.data.map((row) => row.year))].sort((a, b) => a - b);
    const totals = years.map((year) => data.data.filter((row) => row.year === year && ids.includes(row[timeline.key])).reduce((t, row) => t + row[field], 0));
    const factor = Math.max(...totals) < 1 && SMALLER[measure.unit] ? 1000 : 1;
    const last = years.at(-1);
    return {
      unit: factor === 1000 ? SMALLER[measure.unit] : measure.unit,
      periods: years.map((year) => {
        const rows = data.data.filter((row) => row.year === year);
        const current = year === last;
        return {
          key: String(year),
          tick: String(year),
          label: bestand ? (current ? `${year} (aktueller Stand)` : `Ende ${year}`) : current ? `${year} (laufendes Jahr)` : String(year),
          partial: current,
          values: Object.fromEntries(series.map((s) => [s.id, (rows.find((row) => row[timeline.key] === s.id)?.[field] ?? 0) * factor])),
        };
      }),
    };
  }, [data.data, bestand, series, measure, timeline.key]);

  const what = `${measure.quantity}${selectionLabel ? ` · ${selectionLabel}` : ''}`;
  // The CSV: what the chart shows, a row per year, a column per series (in its unit: kW where MW would be too large)
  const csv = periods.length
    ? {
        name: 'zubau-region',
        filename: fileName(fileBase, view, measure.id, scopeKey, timeline.withSelection && selectionSlug(query)),
        rows: () =>
          periods.map((p) => ({
            Jahr: Number(p.key),
            ...Object.fromEntries(series.map((s) => [`${view === 'bestand' ? 'Bestand' : 'Zubau'} ${s.label} (${unit})`, round(p.values[s.id])])),
          })),
      }
    : null;
  return (
    <AnalysisPanel
      id="analyse-zeitverlauf"
      icon={ChartColumnIncreasing}
      title={`Zubau und Bestand · ${scopeName}`}
      lead={bestand ? `Installierte ${what} am Jahresende` : `Neu in Betrieb genommene ${what} je Jahr`}
      className="timeline-card"
    >
      <div className="timeline__controls">
        <AggregateControl aggregiert={aggregiert} onAggregiert={setAggregiert} style={style} onStyle={setStyle} />
        {timeline.measures.length > 1 && (
          <SegmentedControl label="Messgröße" options={timeline.measures.map(({ id, label }) => ({ id, label }))} value={measure.id} onChange={setMeasureId} />
        )}
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
          label={`${measure.quantity} in ${scopeName}: ${bestand ? 'Bestand am Jahresende' : 'Zubau je Jahr'}`}
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
      <ChartFoot csv={csv}>
        <p className="timeline__note">
          Nach Inbetriebnahmedatum, Quelle: Marktstammdatenregister. {timeline.note} Hell: laufendes Jahr, das noch wächst,
          auch weil Einheiten oft erst Wochen nach der Inbetriebnahme registriert werden.
        </p>
      </ChartFoot>
    </AnalysisPanel>
  );
}

// -------------------------------------------------------------------------------------------------------------- table

// Every Gemeinde of the Kreis, sortable by each column; a row picks its Gemeinde
function GemeindenTable({ profile, rows, kreisName, selected, onSelect, fileBase }) {
  const columns = useMemo(() => [{ id: 'name', label: 'Gemeinde', text: true }, ...profile.table], [profile.table]);
  const barField = profile.size.field;
  const [sort, setSort] = useState({ id: barField, desc: true });
  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === sort.id) ?? columns[0];
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) =>
      column.text ? dir * a.name.localeCompare(b.name, 'de') : dir * ((a[column.id] ?? -Infinity) - (b[column.id] ?? -Infinity)),
    );
  }, [rows, sort, columns]);
  const maxSize = Math.max(...rows.map((r) => r[barField] ?? 0), 0);

  return (
    <AnalysisPanel
      id="analyse-gemeinden"
      icon={Search}
      title={`Gemeinden in ${kreisName}`}
      lead={`${rows.length} Gemeinden · Klick auf eine Zeile zeigt sie auf der Karte und im Steckbrief`}
      tools={
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => exportCsv(sorted.map(profile.csv), fileBase)}>
          <Download size={14} aria-hidden="true" /> CSV
        </button>
      }
    >
      <div className="kommune-table__scroll">
        <table className="kommune-table">
          <thead>
            <tr>
              {columns.map((c) => {
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
                {columns.map((c) =>
                  c.text ? (
                    <th key={c.id} scope="row">
                      <button
                        type="button"
                        className="kommune-table__name"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(r.ags === selected ? null : r.ags);
                        }}
                      >
                        {r.name}
                      </button>
                    </th>
                  ) : (
                    <td key={c.id}>
                      {c.bar && maxSize > 0 && (
                        <span className="kommune-table__bar" aria-hidden="true" style={{ width: `${((r[barField] ?? 0) / maxSize) * 100}%` }} />
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

const CHARTS = { ausrichtung: OrientationRose, groesse: SizeDistribution };

/**
 * The page "Landkreis/Gemeinde" of a dashboard: one Landkreis and its Gemeinden in depth for the dashboard's technology
 * (config/kommune.js: Solar for the Erzeuger, batteries for the Speicher) – on a detailed map with a background map, in
 * figures with rank and comparison, against targets or comparisons, Zubau and Bestand per year, its analyses, and every
 * Gemeinde in a table. Picking a Gemeinde (map, table, list, scope bar) narrows everything to it.
 */
export default function KommuneView({ config, state }) {
  const { region, kreisAgs, kreisFeature, kreisName, gemeindeAgs, kreise, searchParams, setParam } = state;
  const profile = KOMMUNE[config.id];
  const technology = config.technologies.find((t) => t.id === profile.technology);
  const selection = selectionOf(technology, searchParams);
  const query = profile.filters ? selection.query : '';
  const leistungLabel = selection.leistung?.label ?? null;
  const what = [technology.label, leistungLabel].filter(Boolean).join(' · ');
  const subtypes = selection.subtypes;
  const allSubtypes = !subtypes || subtypes.length === technology.subtypes.options.length;
  // Solar's split: the Freifläche alone, in the chosen Leistung (Gebäude is the rest); only while both are chosen
  const freiflaecheQuery = selection.leistung
    ? ['anlagenart=freiflaeche', selection.leistung.id !== technology.leistung.options[0].id && `leistung=${selection.leistung.id}`].filter(Boolean).join('&')
    : '';

  const [metricId, setMetricId] = useState(profile.metrics[0].id);
  const metric = profile.metrics.find((m) => m.id === metricId) ?? profile.metrics[0];
  // The background map, and how strongly the shading covers it: each map comes with its own, the slider changes it
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP);
  const [opacity, setOpacity] = useState(() => BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP).fillOpacity);
  const chooseBasemap = (id) => {
    setBasemap(id);
    setOpacity(BASEMAPS.find((b) => b.id === id).fillOpacity);
  };

  // ------------------------------------------------------------------------------------------------------- data
  const statsPath = technology.statsPath;
  const gemeindeStats = useStats(kreisAgs ? statsUrl(statsPath, 'gemeinde', query) : null);
  const kreisStats = useStats(kreisAgs ? statsUrl(statsPath, 'landkreis', query) : null);
  const landStats = useStats(kreisAgs ? statsUrl(statsPath, 'bundesland', query) : null);
  const splitByFreiflaeche = profile.split.kind === 'freiflaeche' && allSubtypes;
  const gemeindeFF = useStats(kreisAgs && splitByFreiflaeche ? statsUrl(statsPath, 'gemeinde', freiflaecheQuery) : null);
  const kreisFF = useStats(kreisAgs && splitByFreiflaeche ? statsUrl(statsPath, 'landkreis', freiflaecheQuery) : null);
  const splitZubau = useJson(kreisAgs && profile.split.kind === 'zubau' ? `${API_BASE_URL}${profile.timeline.path}?region=${state.scopeKey}` : null);
  const areas = useJson(kreisAgs ? `${API_BASE_URL}/regions/areas?level=gemeinde&within=${kreisAgs}` : null);
  const areasLand = useJson(kreisAgs ? `${API_BASE_URL}/regions/areas?level=bundesland` : null);
  const areasKreise = useJson(kreisAgs ? `${API_BASE_URL}/regions/areas?level=landkreis&within=${region.ags}` : null);
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
  const sizeField = profile.size.field;
  const kreisRow = kreisStats.data?.find((row) => row.landkreis === kreisAgs) ?? null;
  const gemeindeRows = useMemo(
    () =>
      gemeinden?.features.map((f) => ({
        ...f.properties,
        share: kreisRow?.[sizeField] ? (f.properties[sizeField] ?? 0) / kreisRow[sizeField] : null,
      })) ?? [],
    [gemeinden, kreisRow, sizeField],
  );

  // The averages of Germany for the compared figures: the Länder's sums over their areas (kW or kWh per unit)
  const landRow = landStats.data?.find((row) => row.bundesland === region?.ags) ?? null;
  const nationalRow = useMemo(() => {
    if (!landStats.data || !areasLand.data) return null;
    const lands = landStats.data.filter((row) => findBundeslandByAgs(row.bundesland));
    return Object.fromEntries(
      profile.figures.filter((f) => f.compare).map((f) => [f.field, (1000 * sum(lands, f.compare.of)) / sum(areasLand.data, f.compare.per)]),
    );
  }, [landStats.data, areasLand.data, profile.figures]);

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
        largest: [...withData].sort((a, b) => (b[sizeField] ?? 0) - (a[sizeField] ?? 0)).slice(0, 6),
      };

  // How the panel's area splits into its kinds
  const split = useMemo(() => {
    const row = panel.row;
    if (!row) return null;
    const kinds = profile.split.series;
    if (profile.split.kind === 'freiflaeche') {
      if (!splitByFreiflaeche) return null;
      const ffRows = gemeindeAgs ? gemeindeFF.data : kreisFF.data;
      if (!ffRows) return null;
      const ff = ffRows.find((r) => (gemeindeAgs ? r.gemeinde === gemeindeAgs : r.landkreis === kreisAgs))?.[sizeField] ?? 0;
      const total = row[sizeField] || 0;
      if (!total) return null;
      return [
        { ...kinds[0], value: total - ff, share: (total - ff) / total },
        { ...kinds[1], value: ff, share: ff / total },
      ];
    }
    // From the Bestand of the latest year of the area's timeline
    if (!splitZubau.data?.length) return null;
    const latest = Math.max(...splitZubau.data.map((r) => r.year));
    const now = splitZubau.data.filter((r) => r.year === latest);
    const values = kinds.map((k) => ({ ...k, value: now.find((r) => r[profile.timeline.key] === k.id)?.[profile.split.field] ?? 0 }));
    const total = values.reduce((t, v) => t + v.value, 0);
    return total ? values.map((v) => ({ ...v, share: v.value / total })) : null;
  }, [panel.row, profile, splitByFreiflaeche, gemeindeAgs, gemeindeFF.data, kreisFF.data, kreisAgs, sizeField, splitZubau.data]);

  const tooltipFor = useCallback(
    (f) => {
      const p = f.properties;
      const rows = p._hasData
        ? profile.metrics
            .map(
              (m) =>
                `<tr${m.id === metric.id ? ' class="is-active"' : ''}><th>${m.label}</th><td>${formatNumber(p[m.id], m.digits)}</td><td>${m.count ? '' : m.unit}</td></tr>`,
            )
            .join('')
        : `<tr><td class="map-tooltip__empty" colspan="3">Keine ${profile.noun}</td></tr>`;
      const hint = p.ags === gemeindeAgs ? 'Klicken: zurück zum Landkreis' : 'Klicken: Steckbrief der Gemeinde';
      return `<div class="map-tooltip__title">${escapeHtml(p.name)}</div><table>${rows}</table><div class="map-tooltip__hint">${hint}</div>`;
    },
    [metric.id, gemeindeAgs, profile],
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
        <KommuneFinder state={state} onPick={onPick} lead={profile.finderLead} />
      </>
    );
  }

  const mapStatus = [shapes, gemeindeStats, areas].some((r) => r.status === 'error') ? 'error' : gemeinden && gemeindeStats.status === 'ready' ? 'ready' : 'loading';
  const timelineSeries = profile.timeline.series.filter((s) => profile.timeline.key !== 'anlagenart' || !subtypes || subtypes.includes(s.id));
  const kreisEinwohner = areasKreise.data?.find((row) => row.region === kreisAgs)?.einwohner;
  const landEinwohner = areasLand.data?.find((row) => row.region === region.ags)?.einwohner;
  const goalScope = { key: state.scopeKey, name: gemeindeAgs ? gemeinde?.name ?? state.scopeName : kreisName, einwohner: gemeindeAgs ? gemeinde?.einwohner : kreisEinwohner };
  const goalParent = gemeindeAgs
    ? { key: kreisAgs, name: kreisName, einwohner: kreisEinwohner }
    : { key: region.ags, name: region.name, einwohner: landEinwohner };
  const einwohnerDE = areasLand.data ? sum(areasLand.data, 'einwohner') : null;

  return (
    <>
      {scopeBar}
      {profile.filters && (
        <section className="card kommune-toolbar" aria-label="Auswahl">
          <TechFilters
            technology={technology}
            subtypes={subtypes}
            onSubtypes={(ids) => setParam(technology.subtypes.param, ids.join(','), technology.subtypes.options.map((o) => o.id).join(','))}
            leistung={selection.leistung}
            onLeistung={(id) => setParam(technology.leistung.param, id, technology.leistung.options[0].id)}
          />
        </section>
      )}

      <div className="kommune">
        <KommunePanel {...panel} profile={profile} what={what} split={split} onSelect={selectGemeinde} nationalRow={nationalRow} />

        <section className="card kommune-map-card" aria-label={`Karte von ${kreisName}`}>
          <header className="kommune-map-card__head">
            <div>
              <h2 className="card__title">
                {metric.legend}
                {leistungLabel && ` · ${leistungLabel}`}
              </h2>
              <div className="card__subtitle">
                {technology.label} · Gemeinden in {kreisName}
              </div>
            </div>
            <div className="kommune-map-card__tools">
              <label className="kommune-map-card__field">
                <span>Kennzahl</span>
                <select className="timeline__select" value={metric.id} onChange={(e) => setMetricId(e.target.value)}>
                  {profile.metrics.map((m) => (
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
              kreisColor={config.ramp[config.ramp.length - 1]}
            >
              {mapStatus === 'ready' && <MapLegend title={metric.legend} unit={metric.count ? '' : metric.unit} ramp={config.ramp} max={scale.max} clipped={scale.clipped} />}
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
            {mapStatus === 'ready' && (
              <CsvLink
                name="gemeinden-karte"
                filename={fileName(`mastr_${technology.id}_gemeinden`, kreisAgs, selectionSlug(query))}
                rows={() => [...gemeindeRows].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(profile.csv)}
              />
            )}
            <span className="map-card__credit">Grenzen und Einwohner: © GeoBasis-DE / BKG (2025), dl-de/by-2-0, Daten verändert</span>
          </footer>
        </section>
      </div>

      {profile.goals === 'solar' && <KommuneTargets scope={goalScope} parent={goalParent} einwohnerDE={einwohnerDE} />}
      {profile.goals === 'storage' && <KommuneStorage scope={goalScope} parent={goalParent} einwohnerDE={einwohnerDE} />}

      <RegionTimeline
        timeline={profile.timeline}
        scopeKey={state.scopeKey}
        scopeName={state.scopeName}
        query={query}
        series={timelineSeries}
        selectionLabel={leistungLabel}
        fileBase={`mastr_${technology.id}_zeitverlauf`}
      />

      <div className={`analyses-grid ${profile.analyses.length > 1 ? 'analyses-grid--pairs' : 'analyses-grid--single'}`}>
        {profile.analyses.map((a) => {
          const Chart = CHARTS[a.id];
          return (
            <article key={a.id} className="card">
              <header className="card__header">
                <div>
                  <h3 className="card__title">
                    {a.title} · {state.scopeName}
                  </h3>
                  <div className="card__subtitle">{a.subtitle}</div>
                </div>
              </header>
              <div className="card__body">
                <Chart
                  key={state.scopeKey}
                  path={a.path}
                  region={state.scopeKey}
                  query={query}
                  measure={a.measure}
                  unitsLabel={profile.unitsLabel}
                  fileBase={`mastr_${technology.id}`}
                />
              </div>
            </article>
          );
        })}
      </div>

      {gemeindeRows.length > 0 && (
        <GemeindenTable
          profile={profile}
          rows={gemeindeRows}
          kreisName={kreisName}
          selected={gemeindeAgs}
          onSelect={selectGemeinde}
          fileBase={`mastr_${technology.id}_gemeinden_${kreisAgs}`}
        />
      )}
    </>
  );
}
