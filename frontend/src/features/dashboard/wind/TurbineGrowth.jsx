import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../../components/ui/ChartExport';
import { fileName, round } from '../../../lib/files';
import { formatNumber } from '../../../lib/format';
import { niceTicks, quantile } from './turbines';
import Legend from './Legend';

const FIRST_YEAR = 1990;
const MIN_UNITS = 10; // a year with fewer turbines is left out: its median would jump around
const HEIGHT = 260;
const MARGIN = { top: 16, right: 14, bottom: 26, left: 44 };

// The two lengths share an axis (both m); the power has a chart of its own
const LENGTHS = [
  { id: 'nabenhoehe', label: 'Nabenhöhe', color: '#2a6496', scale: 1 },
  { id: 'rotordurchmesser', label: 'Rotordurchmesser', color: '#e28316', scale: 1 },
];
const POWER = [{ id: 'leistung', label: 'Bruttoleistung', color: '#316a3b', scale: 0.001 }];

// Per year: quartiles of each series' column over the turbines shown
function byYear(data, rows, series) {
  const years = new Map();
  for (const i of rows) {
    const year = data.jahr[i];
    if (Number.isNaN(year) || year < FIRST_YEAR) continue;
    if (!years.has(year)) years.set(year, series.map(() => []));
    series.forEach((s, k) => {
      const v = data[s.id][i];
      if (!Number.isNaN(v)) years.get(year)[k].push(v * s.scale);
    });
  }
  return [...years.keys()]
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      values: years.get(year).map((values) => {
        if (values.length < MIN_UNITS) return null;
        values.sort((a, b) => a - b);
        return { q1: quantile(values, 0.25), median: quantile(values, 0.5), q3: quantile(values, 0.75), n: values.length };
      }),
    }));
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    setWidth(ref.current.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// Lines of the medians in their band of the middle half, per year; years ahead (planned) dashed; a tooltip per year
function QuantileChart({ points, series, unit, digits, currentYear, label }) {
  const frame = useRef(null);
  const width = useWidth(frame);
  const [active, setActive] = useState(null);
  const years = points.map((p) => p.year);
  const [first, last] = [years[0], years.at(-1)];
  const max = Math.max(1, ...points.flatMap((p) => p.values.map((v) => v?.q3 ?? 0)));
  const ticks = niceTicks(max, 5);
  const pw = Math.max(0, width - MARGIN.left - MARGIN.right);
  const ph = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (year) => MARGIN.left + ((year - first) / Math.max(1, last - first)) * pw;
  const y = (v) => MARGIN.top + ph - (v / ticks.at(-1)) * ph;

  // A line through the years that have a value, split where years are missing and where the planned ones begin
  const runs = (k, pick) => {
    const out = [];
    let run = [];
    points.forEach((p, idx) => {
      const v = p.values[k];
      const gap = idx > 0 && p.year - points[idx - 1].year > 1;
      if (!v || gap) {
        if (run.length) out.push(run);
        run = [];
      }
      if (v) run.push([x(p.year), y(pick(v)), p.year]);
    });
    if (run.length) out.push(run);
    return out;
  };
  const path = (run) => run.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');

  const xTicks = years.filter((year) => year % 5 === 0);
  const point = active == null ? null : points.find((p) => p.year === active);
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const year = Math.round(first + ((e.clientX - rect.left - MARGIN.left) / pw) * (last - first));
    setActive(years.includes(year) ? year : null);
  };

  return (
    <div className="growth" ref={frame}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="scatter__grid" x1={MARGIN.left} x2={MARGIN.left + pw} y1={y(t)} y2={y(t)} />
              <text className="scatter__tick" x={MARGIN.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {formatNumber(t, t % 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          <text className="scatter__axis-label" x={MARGIN.left - 6} y={MARGIN.top - 6} textAnchor="end">
            {unit}
          </text>
          {currentYear < last && (
            <rect className="growth__ahead" x={x(currentYear + 0.5)} y={MARGIN.top} width={x(last) - x(currentYear + 0.5) + 6} height={ph}>
              <title>Geplante Anlagen</title>
            </rect>
          )}
          {series.map((s, k) =>
            runs(k, (v) => v.median).map((run, r) => {
              const lows = runs(k, (v) => v.q1)[r];
              const band = `${path(runs(k, (v) => v.q3)[r])}${lows
                .slice()
                .reverse()
                .map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`)
                .join('')}Z`;
              const ahead = run[0][2] > currentYear;
              return (
                <g key={`${s.id}-${r}`}>
                  <path className="growth__band" d={band} style={{ fill: s.color }} />
                  <path className={`growth__line${ahead ? ' is-ahead' : ''}`} d={path(run)} style={{ stroke: s.color }} />
                </g>
              );
            }),
          )}
          <line className="scatter__baseline" x1={MARGIN.left} x2={MARGIN.left + pw} y1={MARGIN.top + ph} y2={MARGIN.top + ph} />
          {xTicks.map((year) => (
            <text key={year} className="scatter__tick" x={x(year)} y={HEIGHT - 8} textAnchor="middle">
              {year}
            </text>
          ))}
          {point && (
            <g>
              <line className="growth__cursor" x1={x(point.year)} x2={x(point.year)} y1={MARGIN.top} y2={MARGIN.top + ph} />
              {point.values.map((v, k) => v && <circle key={series[k].id} cx={x(point.year)} cy={y(v.median)} r={4} style={{ fill: series[k].color }} className="growth__dot" />)}
            </g>
          )}
        </svg>
      )}
      {point && (
        <div className="scatter__tooltip" style={{ left: x(point.year), top: MARGIN.top + 10, transform: `translateX(${x(point.year) > width / 2 ? 'calc(-100% - 12px)' : '12px'})` }}>
          <div className="scatter__tooltip-title">
            {point.year > currentYear ? `${point.year} (geplant)` : point.year}
          </div>
          {point.values.map(
            (v, k) =>
              v && (
                <div key={series[k].id} className="scatter__tooltip-row">
                  <span>
                    <i className="wind-legend__dot" style={{ background: series[k].color }} /> {series[k].label}
                  </span>
                  <b>
                    {formatNumber(v.median, digits)} {unit}
                  </b>
                  <small>
                    {formatNumber(v.q1, digits)}–{formatNumber(v.q3, digits)} · {formatNumber(v.n)} Anl.
                  </small>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
}

// How the turbines grew: hub height and rotor (m) in one chart, the power (MW) in one beside it
export default function TurbineGrowth({ turbines, fileBase }) {
  const { data, rows } = turbines;
  const lengths = useMemo(() => (data && rows ? byYear(data, rows, LENGTHS) : null), [data, rows]);
  const power = useMemo(() => (data && rows ? byYear(data, rows, POWER) : null), [data, rows]);
  if (!lengths) return <ChartPlaceholder variant="bars" title={turbines.status === 'error' ? 'Keine Daten' : 'Wird geladen …'} />;
  if (!lengths.length) return <ChartPlaceholder variant="bars" title="Zu wenige Anlagen" note="Im Gebiet gibt es zu wenige Anlagen je Jahr." />;
  const currentYear = new Date().getFullYear();

  const csv = {
    name: 'wind-wachstum',
    filename: fileName(fileBase, 'groesse-je-jahr'),
    rows: () =>
      lengths.map((p, idx) => {
        const row = { Jahr: p.year };
        [...LENGTHS, ...POWER].forEach((s, k) => {
          const v = k < LENGTHS.length ? p.values[k] : power[idx]?.values[0];
          const unit = s.id === 'leistung' ? 'MW' : 'm';
          row[`${s.label} Median (${unit})`] = round(v?.median, 2);
          row[`${s.label} 25 % (${unit})`] = round(v?.q1, 2);
          row[`${s.label} 75 % (${unit})`] = round(v?.q3, 2);
        });
        row.Anlagen = p.values[0]?.n ?? null;
        return row;
      }),
  };

  return (
    <>
      <div className="growth-grid">
        <figure className="growth-figure">
          <figcaption>Nabenhöhe und Rotordurchmesser</figcaption>
          <QuantileChart points={lengths} series={LENGTHS} unit="m" digits={0} currentYear={currentYear} label="Nabenhöhe und Rotordurchmesser je Jahr" />
          <Legend items={LENGTHS} label="Linien" />
        </figure>
        <figure className="growth-figure">
          <figcaption>Bruttoleistung</figcaption>
          <QuantileChart points={power} series={POWER} unit="MW" digits={1} currentYear={currentYear} label="Bruttoleistung je Jahr" />
          <Legend items={POWER} label="Linien" />
        </figure>
      </div>
      <ChartFoot csv={csv}>
        <p className="wind-note">
          Linie: Median der Anlagen eines Jahres, Band: die mittlere Hälfte (25 bis 75 %). Jahre mit weniger als {MIN_UNITS} Anlagen fehlen.
          Rechts im getönten Bereich die geplanten Anlagen, nach dem Jahr, in dem sie in Betrieb gehen sollen (Anlagen „In Planung“ oben
          zuschalten). Stillgelegte Anlagen zeigen, was früher gebaut wurde.
        </p>
      </ChartFoot>
    </>
  );
}
