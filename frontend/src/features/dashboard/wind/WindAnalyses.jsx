import { useMemo } from 'react';
import { ChartScatter, Grid3x3, TrendingUp } from 'lucide-react';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../../components/ui/CsvLink';
import { fileName, round } from '../../../lib/files';
import { formatNumber } from '../../../lib/format';
import AnalysisPanel from '../AnalysisPanel';
import Legend from './Legend';
import ScatterCanvas from './ScatterCanvas';
import TurbineGrowth from './TurbineGrowth';
import TurbineMap from './TurbineMap';
import { STATUSES, VARIABLES, axisMax, correlation, valuesOf, variableOf } from './turbines';
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

// Nabenhöhe over Rotordurchmesser, every turbine a dot: the card beside the size classes (where solar has its rose)
function SizeCard({ turbines, scopeName, fileBase }) {
  const { data, rows, groups } = turbines;
  const [x, y] = [variableOf('rotordurchmesser'), variableOf('nabenhoehe')];
  const points = useMemo(() => {
    if (!data || !rows) return null;
    const xs = valuesOf(data, rows, x);
    const ys = valuesOf(data, rows, y);
    return { xs, ys, group: Uint8Array.from(rows, (i) => groups.group[i]), r: correlation(xs, ys), xMax: axisMax(xs), yMax: axisMax(ys) };
  }, [data, rows, groups, x, y]);

  return (
    <article className="card">
      <header className="card__header">
        <div>
          <h3 className="card__title">Nabenhöhe und Rotordurchmesser</h3>
          <div className="card__subtitle">{scopeName} · jede Windenergieanlage ein Punkt</div>
        </div>
      </header>
      <div className="card__body">
        {!points ? (
          <ChartPlaceholder variant="bars" title={turbines.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />
        ) : (
          <>
            <ScatterCanvas
              xs={points.xs}
              ys={points.ys}
              group={points.group}
              colors={groups.colors}
              xMax={points.xMax}
              yMax={points.yMax}
              xLabel="Rotordurchmesser (m)"
              yLabel="Nabenhöhe (m)"
              describe={describer(data, rows)}
              label={`Nabenhöhe über Rotordurchmesser, ${rows.length} Windenergieanlagen`}
            />
            <Legend items={groups.legend} label="Farben" />
            <ChartFoot csv={{ name: 'wind-nabenhoehe-rotor', filename: fileName(fileBase, 'nabenhoehe-rotordurchmesser'), rows: turbineRows(data, rows) }}>
              <p className="wind-note">
                Korrelation r = {points.r.r == null ? '–' : formatNumber(points.r.r, 2)} ({formatNumber(points.r.n)} Anlagen mit beiden
                Angaben). Je Einheit im Marktstammdatenregister, nicht je Windpark. Anlagen desselben Typs haben genau dieselben Maße: die Punkte
                sind leicht gestreut, damit ihre Menge sichtbar wird.
              </p>
            </ChartFoot>
          </>
        )}
      </div>
    </article>
  );
}

// The three sizes against each other, like seaborn's pairplot: their distributions on the diagonal, every pair as dots
// below it, and how closely they go together (Pearson's r) above it
function PairsPanel({ turbines, scopeName, fileBase }) {
  const { data, rows, groups } = turbines;
  const columns = useMemo(() => {
    if (!data || !rows) return null;
    return VARIABLES.map((v) => {
      const values = valuesOf(data, rows, v);
      return { variable: v, values, max: axisMax(values) };
    });
  }, [data, rows]);
  const group = useMemo(() => (rows && groups ? Uint8Array.from(rows, (i) => groups.group[i]) : null), [rows, groups]);
  const correlations = useMemo(
    () => columns && columns.map((a) => columns.map((b) => correlation(a.values, b.values))),
    [columns],
  );

  const csv = correlations && {
    name: 'wind-korrelation',
    filename: fileName(fileBase, 'korrelationsmatrix'),
    rows: () =>
      columns.map((a, i) => ({
        Größe: `${a.variable.label} (${a.variable.unit})`,
        ...Object.fromEntries(columns.map((b, j) => [b.variable.label, round(correlations[i][j].r, 3)])),
      })),
  };

  return (
    <AnalysisPanel
      id="analyse-wind-korrelation"
      icon={Grid3x3}
      title="Korrelationsmatrix"
      lead={`${scopeName} · Nabenhöhe, Rotordurchmesser und Bruttoleistung jeder Windenergieanlage`}
    >
      {!columns ? (
        <ChartPlaceholder variant="bars" title={turbines.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />
      ) : (
        <>
          <div className="pairs" role="img" aria-label="Paarweise Streudiagramme und Korrelationen">
            <div className="pairs__corner" />
            {columns.map((c) => (
              <div key={`top-${c.variable.id}`} className="pairs__head">
                {c.variable.label} <span>({c.variable.unit})</span>
              </div>
            ))}
            {columns.map((row, i) => (
              <div key={row.variable.id} className="pairs__row">
                <div className="pairs__side">
                  {row.variable.label} <span>({row.variable.unit})</span>
                </div>
                {columns.map((col, j) =>
                  i === j ? (
                    <Histogram key={col.variable.id} values={col.values} max={col.max} group={group} colors={groups.colors} variable={col.variable} />
                  ) : i > j ? (
                    <div key={col.variable.id} className="pairs__cell">
                      <ScatterCanvas
                        compact
                        square
                        xs={col.values}
                        ys={row.values}
                        group={group}
                        colors={groups.colors}
                        xMax={col.max}
                        yMax={row.max}
                        describe={describer(data, rows)}
                        label={`${row.variable.label} über ${col.variable.label}`}
                      />
                    </div>
                  ) : (
                    <CorrelationTile key={col.variable.id} {...correlations[i][j]} />
                  ),
                )}
              </div>
            ))}
          </div>
          <Legend items={groups.legend} label="Farben" />
          <ChartFoot csv={csv}>
            <p className="wind-note">
              Unten links jedes Paar als Punktwolke, oben rechts die Korrelation r nach Pearson (1: steigen genau gemeinsam), auf der
              Diagonale die Verteilung jeder Größe. Achsen bis zum 99,9-%-Wert: ein paar Tippfehler im Register drücken sonst alles zusammen.
            </p>
          </ChartFoot>
        </>
      )}
    </AnalysisPanel>
  );
}

// The distribution of one size on the matrix' diagonal: bins, stacked by the colour groups
function Histogram({ values, max, group, colors, variable }) {
  const BINS = 24;
  const bins = useMemo(() => {
    const counts = Array.from({ length: BINS }, () => new Array(colors.length).fill(0));
    for (let k = 0; k < values.length; k += 1) {
      const v = values[k];
      if (Number.isNaN(v)) continue;
      const b = Math.min(BINS - 1, Math.floor((Math.min(v, max) / max) * BINS));
      counts[b][group[k]] += 1;
    }
    return counts;
  }, [values, max, group, colors.length]);
  const top = Math.max(1, ...bins.map((c) => c.reduce((a, b) => a + b, 0)));
  return (
    <div className="pairs__cell pairs__cell--hist">
      <svg viewBox={`0 0 ${BINS * 10} 100`} preserveAspectRatio="none" aria-label={`Verteilung ${variable.label}`}>
        {bins.map((counts, b) => {
          let y = 100;
          return counts.map((c, g) => {
            if (!c) return null;
            const h = (c / top) * 92;
            y -= h;
            return <rect key={`${b}-${g}`} x={b * 10 + 1} y={y} width={8} height={h} style={{ fill: colors[g] }} />;
          });
        })}
      </svg>
      <div className="pairs__range tabular">
        <span>0</span>
        <span>
          {formatNumber(max, variable.digits)} {variable.unit}
        </span>
      </div>
    </div>
  );
}

function CorrelationTile({ r, n }) {
  const strength = r == null ? 0 : Math.abs(r);
  return (
    <div className="pairs__cell pairs__corr" style={{ '--strength': strength }}>
      <span className="pairs__r tabular">{r == null ? '–' : formatNumber(r, 2)}</span>
      <span className="pairs__n tabular">r · {formatNumber(n)} Anlagen</span>
    </div>
  );
}

export function WindSizeCard(props) {
  return <SizeCard {...props} />;
}

export function WindPanels({ turbines, scopeName, scopeKey, fileBase }) {
  return (
    <>
      <PairsPanel turbines={turbines} scopeName={scopeName} fileBase={fileBase} />
      <AnalysisPanel
        id="analyse-wind-wachstum"
        icon={TrendingUp}
        title="Wie die Anlagen gewachsen sind"
        lead={`${scopeName} · Median und mittlere Hälfte je Jahr der Inbetriebnahme, geplante Anlagen nach dem geplanten Jahr`}
      >
        <TurbineGrowth turbines={turbines} fileBase={fileBase} />
      </AnalysisPanel>
      <AnalysisPanel
        id="analyse-wind-karte"
        icon={ChartScatter}
        title="Wo die großen Anlagen stehen"
        lead={`${scopeName} · Größe der Windenergieanlagen nach Ort`}
      >
        <TurbineMap turbines={turbines} scopeKey={scopeKey} fileBase={fileBase} />
      </AnalysisPanel>
    </>
  );
}
