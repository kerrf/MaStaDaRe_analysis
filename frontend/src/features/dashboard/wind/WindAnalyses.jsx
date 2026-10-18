import { useMemo } from 'react';
import { Grid3x3, TrendingUp } from 'lucide-react';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../../components/ui/ChartExport';
import { fileName, round } from '../../../lib/files';
import { formatNumber } from '../../../lib/format';
import AnalysisPanel from '../AnalysisPanel';
import Legend from './Legend';
import ScatterCanvas from './ScatterCanvas';
import TurbineGrowth from './TurbineGrowth';
import TurbineMap from './TurbineMap';
import { STATUSES, VARIABLES, axisMax, correlation, valuesOf } from './turbines';
import './wind.css';

const fmt = (value, digits = 0) => (Number.isNaN(value) ? '–' : formatNumber(value, digits));

// What the tooltip says about a turbine
const describer = (data, rows) => (k) => {
  const i = rows[k];
  const status = data.statusNames[data.status[i]];
  const year = data.jahr[i];
  return {
    title: `${data.herstellerNames[data.hersteller[i]]} · ${Number.isNaN(year) ? 'Jahr unbekannt' : status === 'geplant' ? `geplant ${year}` : year}`,
    rows: [
      ['Nabenhöhe', `${fmt(data.nabenhoehe[i])} m`],
      ['Rotordurchmesser', `${fmt(data.rotordurchmesser[i])} m`],
      ['Bruttoleistung', `${fmt(data.leistung[i] / 1000, 2)} MW`],
      ['Status', STATUSES.find((s) => s.id === status)?.label ?? status],
    ],
  };
};

// The turbines as CSV: one row each, what the charts show of them
const turbineRows = (data, rows) => () =>
  Array.from(rows, (i) => ({
    Status: STATUSES.find((s) => s.id === data.statusNames[data.status[i]])?.label,
    Lage: data.lageNames[data.lage[i]] === 'auf_see' ? 'Auf See' : 'An Land',
    'Jahr (Inbetriebnahme, geplant)': Number.isNaN(data.jahr[i]) ? null : data.jahr[i],
    'Nabenhöhe (m)': round(data.nabenhoehe[i], 1),
    'Rotordurchmesser (m)': round(data.rotordurchmesser[i], 1),
    'Bruttoleistung (kW)': round(data.leistung[i], 0),
    Hersteller: data.herstellerNames[data.hersteller[i]],
    Gemeindeschlüssel: data.ags[i] == null ? null : String(data.ags[i]).padStart(8, '0'),
    Längengrad: round(data.lon[i], 3),
    Breitengrad: round(data.lat[i], 3),
  }));

// The pairs of sizes that go together, each as a plot: x, then y
const PAIRS = [
  ['rotordurchmesser', 'nabenhoehe'],
  ['rotordurchmesser', 'leistung'],
  ['nabenhoehe', 'leistung'],
];

// How closely two sizes go together: every turbine a dot, in three plots side by side, each with its correlation r
// (Pearson) in the corner – instead of a matrix of nine cells, six of which repeat the others or say nothing
function CorrelationPanel({ turbines, scopeName, fileBase }) {
  const { data, rows, groups } = turbines;
  const plots = useMemo(() => {
    if (!data || !rows) return null;
    const columns = Object.fromEntries(
      VARIABLES.map((v) => {
        const values = valuesOf(data, rows, v);
        return [v.id, { variable: v, values, max: axisMax(values) }];
      }),
    );
    return PAIRS.map(([x, y]) => ({ x: columns[x], y: columns[y], ...correlation(columns[x].values, columns[y].values) }));
  }, [data, rows]);
  const group = useMemo(() => (rows && groups ? Uint8Array.from(rows, (i) => groups.group[i]) : null), [rows, groups]);

  // The dots: every turbine with its sizes
  const csv = plots && { name: 'wind-korrelation', filename: fileName(fileBase, 'korrelation'), rows: turbineRows(data, rows) };

  return (
    <AnalysisPanel
      id="analyse-wind-korrelation"
      icon={Grid3x3}
      title="Korrelation von Nabenhöhe, Rotordurchmesser und Leistung"
      lead={`${scopeName} · jede Windenergieanlage ein Punkt, je Paar die Korrelation r`}
    >
      {!plots ? (
        <ChartPlaceholder variant="bars" title={turbines.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />
      ) : (
        <>
          <div className="correlations">
            {plots.map((p) => (
              <figure key={`${p.x.variable.id}-${p.y.variable.id}`} className="correlations__plot">
                <figcaption>
                  {p.y.variable.label} und {p.x.variable.label}
                </figcaption>
                <ScatterCanvas
                  xs={p.x.values}
                  ys={p.y.values}
                  group={group}
                  colors={groups.colors}
                  xMax={p.x.max}
                  yMax={p.y.max}
                  xLabel={`${p.x.variable.label} (${p.x.variable.unit})`}
                  yLabel={`${p.y.variable.label} (${p.y.variable.unit})`}
                  height={320}
                  describe={describer(data, rows)}
                  note={
                    <>
                      <span className="scatter__r tabular">r = {p.r == null ? '–' : formatNumber(p.r, 2)}</span>
                      <span className="scatter__n tabular">{formatNumber(p.n)} Anlagen</span>
                    </>
                  }
                  label={`${p.y.variable.label} über ${p.x.variable.label}, Korrelation r = ${p.r == null ? 'unbekannt' : formatNumber(p.r, 2)}`}
                />
              </figure>
            ))}
          </div>
          <Legend items={groups.legend} label="Farben" />
          <ChartFoot csv={csv}>
            <p className="wind-note">
              r: Korrelation nach Pearson über die Anlagen mit beiden Angaben – 1: beide Größen steigen genau gemeinsam, 0: kein
              Zusammenhang. Je Einheit im Marktstammdatenregister, nicht je Windpark. Anlagen desselben Typs haben genau dieselben Maße: die
              Punkte sind leicht gestreut, damit ihre Menge sichtbar wird. Achsen bis zum 99,9-%-Wert: ein paar Tippfehler im Register drücken
              sonst alles zusammen.
            </p>
          </ChartFoot>
        </>
      )}
    </AnalysisPanel>
  );
}

export function WindPanels({ turbines, scopeName, scopeKey, fileBase }) {
  return (
    <>
      <CorrelationPanel turbines={turbines} scopeName={scopeName} fileBase={fileBase} />
      <AnalysisPanel
        id="analyse-wind-wachstum"
        icon={TrendingUp}
        title="Wie die Anlagen gewachsen sind"
        lead={`${scopeName} · Median und mittlere Hälfte je Jahr der Inbetriebnahme, geplante Anlagen nach dem geplanten Jahr`}
      >
        <TurbineGrowth turbines={turbines} fileBase={fileBase} />
      </AnalysisPanel>
      <TurbineMap turbines={turbines} scopeKey={scopeKey} scopeName={scopeName} fileBase={fileBase} />
    </>
  );
}
