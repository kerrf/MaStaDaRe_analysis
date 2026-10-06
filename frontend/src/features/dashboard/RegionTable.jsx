import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, RefreshCw, Search, Table2 } from 'lucide-react';
import { GRANULARITIES, regionTablesOf } from '../../config/dashboards';
import { API_BASE_URL } from '../../config/site';
import { trackEvent } from '../../lib/usage';
import { inkOn, makeColorScale } from '../../lib/colorScale';
import { useJson, useTopology } from '../../lib/data';
import { exportCsv } from '../../lib/files';
import { formatNumber, formatShare } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';

// The levels of the table, coarse to fine: the names come with their boundaries, like on the map
const LEVELS = [
  { id: 'bundesland', one: 'Bundesland', many: 'Bundesländer', digits: 2 },
  { id: 'landkreis', one: 'Landkreis', many: 'Landkreise', digits: 5 },
  { id: 'gemeinde', one: 'Gemeinde', many: 'Gemeinden', digits: 8 },
].map((level) => ({ ...level, topology: GRANULARITIES.find((g) => g.id === level.id).topology }));

// What the cells show; unit: in the switch and the CSV headers
const MODES = [
  { id: 'anteil', label: 'Anteil', unit: '%', title: 'Anteil an der Leistung des Gebiets' },
  { id: 'leistung', label: 'Leistung', unit: 'MW', title: 'Leistung in MW' },
  { id: 'anzahl', label: 'Anzahl', unit: 'Anzahl', title: 'Anzahl der Anlagen' },
];
const PAGE = 50; // rows at a time; the CSV has all of them
const BY_TOTAL = { column: 'total', descending: true };

const sum = (values) => values.reduce((total, value) => total + value, 0);
const formatPower = (mw) => formatNumber(mw, mw >= 100 ? 0 : mw >= 10 ? 1 : 2);
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

// A column header that sorts the table by its column: descending first, names ascending first
function SortHeader({ column, sort, onSort, className, children }) {
  const active = sort.column === column;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : undefined}
    >
      <button type="button" className="region-table__sort" onClick={() => onSort(column)}>
        {children}
        {active &&
          (sort.descending ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
      </button>
    </th>
  );
}

/**
 * The analyses for every Land, Kreis or Gemeinde below the scope (scopeKey: "DE", a Land or a Kreis key), one column
 * per orientation or size class. The cells of a row are shaded against each other like the rose: an area's largest
 * category is its darkest. Sortable, searchable and downloadable.
 *
 * The controls look like what they choose: the analysis as tabs, the areas (rows) as a labelled dropdown, the values
 * (cells) as a labelled unit switch, search and download as tools on the right.
 */
export default function RegionTable({ technology, scopeKey, scopeName, selectionQuery, ramp, fileBase, anchor }) {
  const datasets = regionTablesOf(technology);
  const [datasetId, setDatasetId] = useState(null);
  const [levelId, setLevelId] = useState(null);
  const [mode, setMode] = useState('anteil');
  const [sort, setSort] = useState(BY_TOTAL); // column: 'name', 'total' or the index of a column
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const dataset = datasets.find((d) => d.id === datasetId) ?? datasets[0];
  // Only the levels below the scope: a Land lists its Kreise or Gemeinden, a Kreis its Gemeinden
  const within = scopeKey === 'DE' ? null : scopeKey;
  const levels = LEVELS.filter((level) => level.digits > (within?.length ?? 0));
  const level = levels.find((l) => l.id === levelId) ?? levels[0];

  // selectionQuery: the technology's selection (Anlagenart, Brutto/Netto)
  const params = [`level=${level.id}`, within && `within=${within}`, selectionQuery].filter(Boolean).join('&');
  const table = useJson(dataset ? `${API_BASE_URL}${dataset.path}?${params}` : null);
  const shapes = useTopology(dataset ? level.topology : null);

  const columns = useMemo(() => table.data?.columns ?? [], [table.data]);
  const rows = useMemo(() => {
    if (!table.data || !shapes.data) return [];
    const names = new Map(shapes.data.features.map((f) => [f.properties.ags, f.properties.name]));
    return table.data.rows.map((row) => ({
      ags: row.region,
      name: names.get(row.region) ?? row.region,
      power: row.power,
      units: row.units,
      totalPower: sum(row.power),
      totalUnits: sum(row.units),
    }));
  }, [table.data, shapes.data]);

  // The value of a cell and of the Gesamt column in the chosen mode
  const [valueOf, totalOf] = useMemo(() => {
    if (mode === 'anteil')
      return [(row, i) => (row.totalPower ? row.power[i] / row.totalPower : 0), (row) => row.totalPower];
    if (mode === 'leistung') return [(row, i) => row.power[i], (row) => row.totalPower];
    return [(row, i) => row.units[i], (row) => row.totalUnits];
  }, [mode]);

  // The colours of a row: relative to each other within the area, its largest category the darkest
  const colorsOf = (row) =>
    makeColorScale(
      ramp,
      columns.reduce((max, _, i) => Math.max(max, valueOf(row, i)), 0),
    );

  const ordered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('de');
    const found = needle
      ? rows.filter((row) => row.name.toLocaleLowerCase('de').includes(needle) || row.ags.startsWith(needle))
      : rows;
    const key =
      sort.column === 'name'
        ? null
        : sort.column === 'total' || sort.column >= columns.length
          ? totalOf
          : (row) => valueOf(row, sort.column);
    const compare = key ? (a, b) => key(a) - key(b) : (a, b) => a.name.localeCompare(b.name, 'de');
    return [...found].sort((a, b) => (sort.descending ? compare(b, a) : compare(a, b)));
  }, [rows, columns, query, sort, valueOf, totalOf]);

  if (!dataset) return null;

  const modeInfo = MODES.find((m) => m.id === mode);
  const reset = (apply) => (value) => {
    apply(value);
    setLimit(PAGE);
  };
  const sortBy = (column) =>
    setSort((prev) =>
      prev.column === column ? { column, descending: !prev.descending } : { column, descending: column !== 'name' },
    );

  const download = () => {
    trackEvent('Tabellenexport', { analyse: `${technology.id}/${dataset.id}`, ebene: level.id });
    exportCsv(
      ordered.map((row) => ({
        AGS: row.ags,
        [level.one]: row.name,
        ...Object.fromEntries(
          columns.map((column, i) => {
            const value = valueOf(row, i);
            return [
              `${column.label} (${modeInfo.unit})`,
              mode === 'anteil' ? round(value * 100, 2) : mode === 'leistung' ? round(value, 3) : value,
            ];
          }),
        ),
        'Gesamt Leistung (MW)': round(row.totalPower, 3),
        'Gesamt Anzahl': row.totalUnits,
      })),
      `${fileBase}_${dataset.id}_${level.id}_${scopeKey.toLowerCase()}_${mode}`,
    );
  };

  // Data and names (the boundaries of the level) both have to be there
  const statuses = [table.status, shapes.status];
  const status = statuses.includes('error') ? 'error' : statuses.every((s) => s === 'ready') ? 'ready' : 'loading';
  const panelId = `${fileBase}-table`;

  return (
    <AnalysisPanel
      id={anchor}
      icon={Table2}
      title="Gebiete im Vergleich"
      lead={`${technology.label} · ${scopeName} · ${status === 'ready' ? `${formatNumber(rows.length)} ${level.many}` : level.many}`}
      className="region-table"
    >
      {/* What the table shows: one tab per analysis */}
      <div className="region-table__tabs" role="tablist" aria-label="Auswertung">
        {datasets.map((d) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={d.id === dataset.id}
            aria-controls={panelId}
            className={`region-table__tab${d.id === dataset.id ? ' is-active' : ''}`}
            onClick={() => {
              reset(setDatasetId)(d.id);
              setSort(BY_TOTAL); // the other analysis has other columns
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="region-table__panel" id={panelId} role="tabpanel">
        <div className="region-table__toolbar">
          {/* The rows */}
          <label className="region-table__field">
            <span className="region-table__field-label">Gebiete</span>
            <select value={level.id} onChange={(e) => reset(setLevelId)(e.target.value)}>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.many}
                </option>
              ))}
            </select>
          </label>
          {/* The cells */}
          <div className="region-table__field">
            <span className="region-table__field-label" id={`${panelId}-values`}>
              Werte
            </span>
            <div className="region-table__values" role="radiogroup" aria-labelledby={`${panelId}-values`}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={m.id === mode}
                  title={m.title}
                  className={`region-table__value${m.id === mode ? ' is-active' : ''}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                  {m.unit !== m.label && <small>{m.unit}</small>}
                </button>
              ))}
            </div>
          </div>
          {/* Tools */}
          <div className="region-table__tools">
            <label className="region-table__search">
              <Search size={14} aria-hidden="true" />
              <span className="visually-hidden">{level.one} suchen</span>
              <input
                type="search"
                placeholder={`${level.one} suchen`}
                value={query}
                onChange={(e) => reset(setQuery)(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn--secondary btn--sm region-table__download"
              onClick={download}
              disabled={status !== 'ready' || !ordered.length}
            >
              <Download size={14} aria-hidden="true" /> CSV
            </button>
          </div>
        </div>

        {status === 'error' ? (
          <div className="timeline__state" role="alert">
            Die Tabelle konnte nicht geladen werden.
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                table.retry();
                shapes.retry();
              }}
            >
              <RefreshCw size={14} aria-hidden="true" /> Erneut versuchen
            </button>
          </div>
        ) : status === 'loading' ? (
          <div className="timeline__state" role="status">
            <div className="spinner" />
            Lade {level.many} …
          </div>
        ) : (
          <>
            <div className="region-table__scroll">
              <table>
                <thead>
                  <tr>
                    <SortHeader column="name" sort={sort} onSort={sortBy}>
                      {level.one}
                    </SortHeader>
                    {columns.map((column, i) => (
                      <SortHeader key={column.key} column={i} sort={sort} onSort={sortBy}>
                        <span>
                          {column.label}
                          {column.hint && <small>{column.hint}</small>}
                        </span>
                      </SortHeader>
                    ))}
                    <SortHeader column="total" sort={sort} onSort={sortBy} className="region-table__total">
                      Gesamt{mode === 'anzahl' ? '' : ' (MW)'}
                    </SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {ordered.slice(0, limit).map((row) => {
                    const colorFor = colorsOf(row);
                    return (
                      <tr key={row.ags}>
                        <th scope="row" title={row.ags}>
                          {row.name}
                        </th>
                        {columns.map((column, i) => {
                          const value = valueOf(row, i);
                          if (!value) {
                            return (
                              <td key={column.key} className="is-zero">
                                –
                              </td>
                            );
                          }
                          const background = colorFor(value);
                          return (
                            <td key={column.key} style={{ background, color: inkOn(background) }}>
                              {mode === 'anteil'
                                ? formatShare(value)
                                : mode === 'leistung'
                                  ? formatPower(value)
                                  : formatNumber(value)}
                            </td>
                          );
                        })}
                        <td className="region-table__total">
                          {mode === 'anzahl' ? formatNumber(totalOf(row)) : formatPower(totalOf(row))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!ordered.length && <div className="region-table__empty">Kein Gebiet gefunden.</div>}
            </div>
            <div className="region-table__foot">
              <span>
                {formatNumber(Math.min(limit, ordered.length))} von {formatNumber(ordered.length)} {level.many}
                {ordered.length > limit && ' · die CSV enthält alle'}
              </span>
              {ordered.length > limit && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setLimit((n) => n + 4 * PAGE)}
                >
                  {formatNumber(Math.min(4 * PAGE, ordered.length - limit))} weitere anzeigen
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </AnalysisPanel>
  );
}
