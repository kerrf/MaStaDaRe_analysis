import { useLayoutEffect, useRef, useState } from 'react';
import { formatNumber, formatShare } from '../../lib/format';
import './GroupedBarChart.css';

const NICE = [1, 2, 2.5, 5, 10];

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// Axis ticks from 0 in steps of 1, 2, 2.5 or 5 times a power of ten, up to at least max
function niceTicks(max, target = 4) {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = NICE.map((f) => f * power).find((s) => s >= rough);
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => i * step);
}

// "0,1–1 MWp" -> ["0,1–1", "MWp"]: the unit on a line of its own below the columns
const splitUnit = (label) => {
  const at = label.lastIndexOf(' ');
  return at > 0 ? [label.slice(0, at), label.slice(at + 1)] : [label];
};

const percent = (share) => formatShare(share);
const tickLabel = (share) => `${formatNumber(share * 100, 1)} %`;

// Width of a label per character (12px font)
const CHAR_WIDTH = 6.6;
const TILT = 40; // degrees, for labels that don't fit side by side

// A group of columns per category, the categories along the bottom: in two lines ("0,1–1" over "MWp"), or tilted where
// even that doesn't fit
function Columns({ width, categories, series, active, onActive }) {
  const AXIS = 40;
  const PLOT = 210;
  const TOP = 12;
  const plot = Math.max(0, width - AXIS - 4);
  const slot = categories.length ? plot / categories.length : 0;
  const tilted = Math.max(...categories.map((c) => splitUnit(c.label)[0].length)) * CHAR_WIDTH + 6 > slot;
  const longest = Math.max(...categories.map((c) => c.label.length)) * CHAR_WIDTH;
  const LABELS = tilted ? Math.ceil(longest * Math.sin((TILT * Math.PI) / 180)) + 18 : 36;
  const column = Math.min(20, Math.max(4, (slot * 0.7 - (series.length - 1) * 3) / series.length));
  const group = series.length * column + (series.length - 1) * 3;
  const max = Math.max(...categories.flatMap((c) => series.map((s) => c.values[s.id] ?? 0)));
  const ticks = niceTicks(max * 100).map((t) => t / 100);
  const top = ticks.at(-1);
  const y = (share) => TOP + PLOT * (1 - share / top);
  const height = TOP + PLOT + LABELS;

  return (
    <svg width={width} height={height} onPointerLeave={() => onActive(null)}>
      {ticks.map((t) => (
        <g key={t} className="bar-chart__grid">
          <line x1={AXIS} x2={width} y1={y(t)} y2={y(t)} />
          <text className="bar-chart__tick" x={AXIS - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {tickLabel(t)}
          </text>
        </g>
      ))}
      {categories.map((c, i) => {
        const x0 = AXIS + i * slot + (slot - group) / 2;
        const [range, unit] = splitUnit(c.label);
        return (
          <g key={c.key} className={active === i ? 'is-active' : undefined} onPointerEnter={() => onActive(i)}>
            <rect className="bar-chart__band" x={AXIS + i * slot} y={0} width={slot} height={height} />
            {series.map((s, k) => {
              const value = c.values[s.id] ?? 0;
              const h = Math.max(value > 0 ? 1.5 : 0, TOP + PLOT - y(value));
              return <rect key={s.id} x={x0 + k * (column + 3)} y={TOP + PLOT - h} width={column} height={h} rx={2} style={{ fill: s.color }} />;
            })}
            {tilted ? (
              <text
                className="bar-chart__label"
                transform={`translate(${AXIS + (i + 0.5) * slot + 4},${TOP + PLOT + 12}) rotate(-${TILT})`}
                textAnchor="end"
              >
                {c.label}
              </text>
            ) : (
              <text className="bar-chart__label" x={AXIS + (i + 0.5) * slot} y={TOP + PLOT + 16} textAnchor="middle">
                {range}
                {unit && (
                  <tspan className="bar-chart__unit" x={AXIS + (i + 0.5) * slot} dy="1.2em">
                    {unit}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
      <line className="bar-chart__baseline" x1={AXIS} x2={width} y1={y(0)} y2={y(0)} />
    </svg>
  );
}

/**
 * Columns for a few categories and two or three series side by side, e.g. the shares of the power and of the units per
 * size class; hovering a category shows its details.
 *
 * categories: [{ key, label, values: { [series.id]: share 0..1 }, details: [{ id, text }] (tooltip lines per series) }]
 * series:     [{ id, label, color }]
 */
export default function GroupedBarChart({ categories, series, label }) {
  const frameRef = useRef(null);
  const width = useWidth(frameRef);
  const [active, setActive] = useState(null);
  const current = active != null ? categories[active] : null;

  return (
    <div className="bar-chart" ref={frameRef} role="img" aria-label={label}>
      {width > 0 && <Columns width={width} categories={categories} series={series} active={active} onActive={setActive} />}
      {current && (
        <div className="bar-chart__tooltip" role="presentation">
          <div className="bar-chart__tooltip-title">{current.label}</div>
          {series.map((s) => (
            <div key={s.id} className="bar-chart__tooltip-row">
              <span className="bar-chart__swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
              <strong>{percent(current.values[s.id] ?? 0)}</strong>
              <span className="bar-chart__tooltip-detail">{current.details?.find((d) => d.id === s.id)?.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
