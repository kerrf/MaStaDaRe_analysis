import { useMemo } from 'react';
import { findBundeslandByAgs, isKreisKey, regionName } from '../../config/regions';
import { API_BASE_URL } from '../../config/site';
import { statsUrl, useJson, useStats } from '../../lib/data';
import { formatCapacity, formatNumber, formatPercent, formatPower } from '../../lib/format';
import { selectionOf } from './useDashboardState';

const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
const joined = ({ value, unit }) => `${value} ${unit}`.trim();
const times = (ratio) => `${formatNumber(ratio, ratio >= 10 ? 0 : 1)}×`;

// The values of the profile: how to read and write each, and whether it is a share of the whole (summed) or a density
// (compared with the average of the whole). The densities exclude the sea: it has no inhabitants.
const MEASURES = [
  { id: 'units', field: 'total_units', label: 'Anlagen', kind: 'sum', format: (v) => formatNumber(v) },
  { id: 'power', field: 'total_power', label: 'Leistung', kind: 'sum', format: (v) => joined(formatPower(v)) },
  { id: 'area', field: 'relative_area_power', label: 'je km²', kind: 'density', base: 'qkm', format: (v) => `${formatNumber(v, v >= 100 ? 0 : 1)} kW` },
  { id: 'people', field: 'relative_population_power', label: 'je Einwohner', kind: 'density', base: 'einwohner', format: (v) => `${formatNumber(v, 2)} kW` },
];
const growthMeasure = (kpi) =>
  kpi && {
    id: 'growth',
    field: kpi.field,
    label: 'Zubau (12 Monate)',
    kind: 'sum',
    format: (v) => joined(kpi.format === 'capacity' ? formatCapacity(v) : formatPower(v)),
  };

// Rank of a row among its peers by a field, the largest first: "3 von 16"
function rankOf(peers, row, field) {
  const larger = peers.filter((peer) => (peer[field] ?? 0) > row[field]).length;
  return `${larger + 1} von ${peers.length}`;
}

/**
 * One technology in the scope: its values, each with its rank among the areas of its kind (Länder; Kreise in the Land
 * and in Germany) and compared with the whole it lies in (its share of the power, its density against the average).
 * In the view of Germany: the totals and the Land at the top.
 */
function ProfileCard({ technology, config, state, areas }) {
  const { region, kreisAgs, scopeName, parentName, searchParams } = state;
  const selection = selectionOf(technology, searchParams);
  const level = kreisAgs ? 'landkreis' : 'bundesland';
  const stats = useStats(statsUrl(technology.statsPath, level, selection.query));
  const kpis = technology.kpis ?? config.kpis;
  const measures = useMemo(() => [...MEASURES, growthMeasure(kpis.find((kpi) => kpi.id === 'growth'))].filter(Boolean), [kpis]);
  const Icon = technology.icon;

  const lines = useMemo(() => {
    if (stats.status !== 'ready' || !areas) return null;
    const areaOf = new Map(areas.map((a) => [a.region, a]));
    const keyOf = (row) => (kreisAgs ? row.landkreis : row.bundesland);
    // The areas of today's boundaries: units may still carry the key of a Kreis merged since (Eisenach)
    const isPeer = kreisAgs
      ? (row) => isKreisKey(row.landkreis) && areaOf.has(row.landkreis)
      : (row) => Boolean(findBundeslandByAgs(row.bundesland));
    const peers = stats.data.filter(isPeer);
    // The whole the scope lies in, and its peers there: the Kreise of the Land, the Länder of Germany
    const inParent = kreisAgs ? peers.filter((row) => keyOf(row).startsWith(region.ags)) : peers;
    const wholeRows = kreisAgs ? inParent : stats.data; // Germany's totals include the sea (offshore wind)
    const wholeArea = { qkm: 0, einwohner: 0 };
    for (const row of inParent) {
      wholeArea.qkm += areaOf.get(keyOf(row))?.qkm ?? 0;
      wholeArea.einwohner += areaOf.get(keyOf(row))?.einwohner ?? 0;
    }
    // kW per km² or per inhabitant of the whole
    const density = (base) => (1000 * sum(inParent, 'total_power')) / wholeArea[base] || 0;

    if (!region) {
      // Germany: the totals (densities over the Länder), and the leading Land
      return measures.map((m) => {
        const value = m.kind === 'sum' ? sum(wholeRows, m.field) : density(m.base);
        const top = [...peers].sort((a, b) => (b[m.field] ?? 0) - (a[m.field] ?? 0))[0];
        return { ...m, value: m.format(value), compare: top ? `vorn: ${regionName(top.bundesland)}` : '', rank: '' };
      });
    }

    const row = peers.find((r) => keyOf(r) === (kreisAgs ?? region.ags));
    if (!row) return [];
    return measures.map((m) => {
      const value = row[m.field] ?? 0;
      let compare;
      if (m.kind === 'sum') {
        const whole = sum(wholeRows, m.field);
        compare = whole ? `${formatPercent(value / whole)} von ${parentName}` : '';
      } else {
        const average = density(m.base);
        compare = average ? `${times(value / average)} ${kreisAgs ? 'Landesschnitt' : 'Bundesschnitt'}` : '';
      }
      // No rank without a value: all the areas without one would share it
      let rank = '';
      if (value > 0) {
        rank = kreisAgs
          ? `Rang ${rankOf(inParent, row, m.field)} im Land · ${rankOf(peers, row, m.field)} bundesweit`
          : `Rang ${rankOf(peers, row, m.field)}`;
      }
      return { ...m, value: m.format(value), compare, rank };
    });
  }, [stats.status, stats.data, areas, region, kreisAgs, parentName, measures]);

  const what = [selection.leistung?.label, selection.note.replace(/^ · /, '')].filter(Boolean).join(' · ');
  return (
    <article className="card profile-card">
      <header className="profile-card__head">
        <span className="profile-card__icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <h3 className="profile-card__title">{technology.label}</h3>
        {what && <span className="profile-card__what">{what}</span>}
      </header>
      {stats.status === 'error' ? (
        <p className="profile-card__state">Die Werte konnten nicht geladen werden.</p>
      ) : !lines ? (
        <p className="profile-card__state">Wird geladen …</p>
      ) : !lines.length ? (
        <p className="profile-card__state">Keine Anlagen in {scopeName}.</p>
      ) : (
        <dl className="profile-card__list">
          {lines.map((line) => (
            <div key={line.id} className="profile-card__item">
              <dt>{line.label}</dt>
              <dd className="profile-card__value">{line.value}</dd>
              {(line.compare || line.rank) && (
                <dd className="profile-card__meta">
                  {line.compare && <span>{line.compare}</span>}
                  {line.rank && <span className="profile-card__rank">{line.rank}</span>}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

// Steckbrief of the scope: one card per technology with values per area (Länder, Kreise), side by side
export default function RegionProfile({ config, state }) {
  const technologies = config.technologies.filter((t) => t.statsPath);
  const level = state.kreisAgs ? 'landkreis' : 'bundesland';
  const areas = useJson(technologies.length ? `${API_BASE_URL}/regions/areas?level=${level}` : null);
  if (!technologies.length) return null;
  const peersText = state.kreisAgs ? `Rang unter den Kreisen in ${state.parentName} und in Deutschland` : 'Rang unter den 16 Ländern';
  return (
    <section className="profile" aria-labelledby="steckbrief-title">
      <div className="profile__head">
        <h2 id="steckbrief-title" className="section-head__title">
          Steckbrief {state.scopeName}
        </h2>
        <p className="profile__lead">
          {state.region
            ? `In Betrieb befindliche Anlagen · Anteil an ${state.parentName}, Dichte im Vergleich zum Durchschnitt · ${peersText}`
            : 'In Betrieb befindliche Anlagen in Deutschland, Dichte über die Fläche der Länder · das Land mit dem höchsten Wert'}
        </p>
      </div>
      <div className="profile__cards">
        {technologies.map((t) => (
          <ProfileCard key={t.id} technology={t} config={config} state={state} areas={areas.data} />
        ))}
      </div>
    </section>
  );
}
