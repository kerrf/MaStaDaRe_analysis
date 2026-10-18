import ChartPlaceholder from '../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../components/ui/ChartExport';
import { API_BASE_URL } from '../../config/site';
import { RAMPS, makeColorScale } from '../../lib/colorScale';
import { useStats } from '../../lib/data';
import { fileName, round, selectionSlug } from '../../lib/files';
import { formatAmount, formatCount, formatShare } from '../../lib/format';
import AnalysisPanel from './AnalysisPanel';
import { RoseSvg } from './OrientationRose';
import { CENTRE, DIRECTIONS } from './orientations';

// The tilt classes of the register, flat to vertical (mrt.solar_orientation_tilt; under 5° counts as 0–20°)
const TILTS = [
  { id: '0_20', label: '0–20°' },
  { id: '21_40', label: '21–40°' },
  { id: '41_60', label: '41–60°' },
  { id: '61_89', label: '61–89°' },
  { id: '90', label: '90°' },
];
const ORIENTATIONS = [...DIRECTIONS, ...CENTRE, { id: 'unbekannt', label: 'Unbekannt' }];
const NO_ROW = { total_units: 0, total_power: 0 };

/**
 * Ausrichtung nach Neigungswinkel: the orientation rose once per tilt class, side by side, in the scope (region: "DE",
 * a Land, Kreis or Gemeinde) and the selection (query: Anlagenart, Leistung). Each rose shows the shares within its
 * class, all on one colour scale, so the roses compare: flat modules face east and west, steep ones south.
 */
export default function OrientationTiltAnalysis({ analysis, region, scopeName, query, fileBase, anchor }) {
  const stats = useStats(`${API_BASE_URL}${analysis.path}?region=${region}${query ? `&${query}` : ''}`);
  const lead = `${scopeName} · Leistung nach Hauptausrichtung der Module, je Neigungswinkel`;
  const panel = (body) => (
    <AnalysisPanel id={anchor} icon={analysis.icon} title={analysis.title} lead={lead} className="tilt-card">
      {body}
    </AnalysisPanel>
  );
  if (stats.status === 'error') return panel(<ChartPlaceholder variant="radial" title="Keine Daten" note="Die Auswertung konnte nicht geladen werden." />);
  if (stats.status !== 'ready') return panel(<ChartPlaceholder variant="radial" title="Wird geladen …" />);

  const rows = stats.data;
  const sumOf = (list, field) => list.reduce((total, row) => total + row[field], 0);
  const total = sumOf(rows, 'total_power');
  if (!sumOf(rows, 'total_units')) {
    return panel(<ChartPlaceholder variant="radial" title="Keine Anlagen" note="In diesem Gebiet ist keine Solaranlage in Betrieb." />);
  }
  const classOf = (tilt) => {
    const own = rows.filter((row) => row.tilt === tilt);
    const byId = Object.fromEntries(own.map((row) => [row.orientation, row]));
    const power = sumOf(own, 'total_power');
    return { power, units: sumOf(own, 'total_units'), rowOf: (id) => byId[id] ?? NO_ROW, shareOf: (id) => (power ? (byId[id]?.total_power ?? 0) / power : 0) };
  };
  const classes = TILTS.map((t) => ({ ...t, ...classOf(t.id) }));
  const tracked = classOf('nachgefuehrt');
  const unknown = classOf('unbekannt');
  // One scale for all roses: the largest share of any orientation in any class is the darkest
  const colorFor = makeColorScale(RAMPS.orange, Math.max(...classes.flatMap((c) => [...DIRECTIONS, ...CENTRE].map((o) => c.shareOf(o.id)))));

  const csv = {
    name: 'ausrichtung-neigung',
    filename: fileName(fileBase, 'ausrichtung-neigung', region, selectionSlug(query)),
    rows: () =>
      [...classes, { label: 'Nachgeführt', ...tracked }, { label: 'Unbekannt', ...unknown }].flatMap((c) =>
        ORIENTATIONS.map((o) => ({
          Neigungswinkel: c.label,
          Ausrichtung: o.label,
          'Leistung (MW)': round(c.rowOf(o.id).total_power),
          'Anteil an der Neigungsklasse (%)': round(100 * c.shareOf(o.id), 2),
          Anlagen: c.rowOf(o.id).total_units,
        })),
      ),
  };

  return panel(
    <>
      <div className="tilt-roses">
        {classes.map((c) => (
          <figure key={c.id} className="tilt-rose">
            <figcaption className="tilt-rose__head">
              <span className="tilt-rose__title">{c.label}</span>
              <span className="tilt-rose__total">
                {formatAmount(c.power, 'MW')} · {formatShare(c.power / total)}
              </span>
            </figcaption>
            {c.units ? (
              <RoseSvg rowOf={c.rowOf} shareOf={c.shareOf} colorFor={colorFor} label={`Ausrichtung der Module mit ${c.label} Neigung`} compact />
            ) : (
              <p className="tilt-rose__empty">Keine Anlagen</p>
            )}
          </figure>
        ))}
      </div>
      <ChartFoot csv={csv}>
        <p className="timeline__note">
          Neigungswinkel nach den Klassen des Marktstammdatenregisters, „unter 5°“ zählt zu 0–20°. Je Rose die Anteile an
          ihrer Klasse; darüber ihre Leistung und ihr Anteil an allen. Ohne Angabe zur Neigung:{' '}
          {formatAmount(unknown.power, 'MW')} ({formatShare(unknown.power / total)}, meist Balkonkraftwerke, deren
          vereinfachte Registrierung sie nicht abfragt); nachgeführt: {formatAmount(tracked.power, 'MW')} ·{' '}
          {formatCount(tracked.units)} Anlagen.
        </p>
      </ChartFoot>
    </>,
  );
}
