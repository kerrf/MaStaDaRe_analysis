import { useLayoutEffect, useRef, useState } from 'react';
import { formatNumber } from '../../lib/format';
import './GroupedBarChart.css';

const NICE = [1, 2, 2.5, 5, 10];
// About this many intervals on the axes
const INTERVALS = 4;

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

// The smallest step of 1, 2, 2.5 or 5 times a power of ten that is at least rough
function niceStep(rough) {
  if (!(rough > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  return NICE.map((f) => f * power).find((s) => s >= rough - 1e-12);
}

// The ticks of each axis, from 0 in steps of its own, both with as many steps as the one that needs the most: so the two
// axes share their grid lines
function sharedTicks(maxima) {
  const steps = maxima.map((max) => niceStep(max / INTERVALS));
  const count = Math.max(1, ...maxima.map((max, i) => Math.ceil(max / steps[i] - 1e-9)));
  return steps.map((step) => Array.from({ length: count + 1 }, (_, k) => Number((k * step).toFixed(9))));
}

// How an axis writes its numbers: in its unit, or a larger one – power from 1,000 MW in GW, counts from 10,000 in
// thousands and from a million in millions
function scaleOf(axis, top) {
  if (axis.kind === 'power') return top >= 1000 ? { factor: 1000, unit: axis.unit.replace(/^M/, 'G') } : { factor: 1, unit: axis.unit };
  if (top >= 1e6) return { factor: 1e6, unit: 'Mio.' };
  if (top >= 1e4) return { factor: 1e3, unit: 'Tsd.' };
  return { factor: 1, unit: '' };
}

// Fraction digits an axis step needs: 2.5 -> 1, 0.25 -> 2
const digitsOf = (step) => [0, 1, 2].find((d) => Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-6) ?? 3;

// "0,1–1 MWp" -> ["0,1–1", "MWp"]: the unit on a line of its own below the columns
const splitUnit = (label) => {
  const at = label.lastIndexOf(' ');
  return at > 0 ? [label.slice(0, at), label.slice(at + 1)] : [label];
};

const CHAR_WIDTH = 6.6; // of a category label per character (12px font)
const VALUE_CHAR_WIDTH = 5.8; // of a value above a column (10px font)
const TILT = 40; // degrees, for labels that don't fit side by side

// A group of columns per category along the bottom; each series measured on its axis, left or right
function Columns({ width, categories, series, axes, active, onActive }) {
  const SIDE = 44; // room for the tick labels of each axis
  const PLOT = 210;
  const TOP = 34; // the axes' units above the plot, the values above the columns
  const plot = Math.max(0, width - 2 * SIDE);
  const slot = categories.length ? plot / categories.length : 0;
  const tilted = Math.max(...categories.map((c) => splitUnit(c.label)[0].length)) * CHAR_WIDTH + 6 > slot;
  const longest = Math.max(...categories.map((c) => c.label.length)) * CHAR_WIDTH;
  const LABELS = tilted ? Math.ceil(longest * Math.sin((TILT * Math.PI) / 180)) + 18 : 36;
  const column = Math.min(26, Math.max(4, (slot * 0.7 - (series.length - 1) * 3) / series.length));
  const group = series.length * column + (series.length - 1) * 3;

  // Per axis: its ticks, the top of its scale and how it writes its numbers
  const sides = ['left', 'right'].filter((side) => series.some((s) => s.axis === side));
  const maxima = sides.map((side) => Math.max(...categories.flatMap((c) => series.filter((s) => s.axis === side).map((s) => c.values[s.id] ?? 0))));
  const ticksBySide = sharedTicks(maxima);
  const scale = Object.fromEntries(
    sides.map((side, i) => {
      const ticks = ticksBySide[i];
      const top = ticks.at(-1);
      const { factor, unit } = scaleOf(axes[side], top);
      return [side, { ticks, top, factor, unit, digits: digitsOf((ticks[1] - ticks[0]) / factor) }];
    }),
  );
  const yOf = (side, value) => TOP + PLOT * (1 - value / scale[side].top);
  const height = TOP + PLOT + LABELS;
  // The axis' numbers in its series' colour, or a darker one for text (ink)
  const colorOf = (side) => {
    const s = series.find((one) => one.axis === side);
    return s.ink ?? s.color;
  };

  // The value above a column, in its axis' unit ("1,2" under GW, "345" under Tsd. Anlagen), where every one fits
  const valueText = (side, value) => {
    const v = value / scale[side].factor;
    const text = v > 0 ? formatNumber(v, v >= 10 ? 0 : v >= 1 ? 1 : 2) : null;
    // A column too small for its digits gets none: "0" over a column would be wrong
    return text === '0' ? null : text;
  };
  const longestValue = Math.max(...categories.flatMap((c) => series.map((s) => valueText(s.axis, c.values[s.id] ?? 0)?.length ?? 0)));
  const showValues = longestValue * VALUE_CHAR_WIDTH <= column + 3;

  const left = scale.left ?? scale.right;
  return (
    <svg width={width} height={height} onPointerLeave={() => onActive(null)}>
      {left.ticks.map((t, k) => (
        <g key={t} className="bar-chart__grid">
          <line x1={SIDE} x2={width - SIDE} y1={TOP + PLOT * (1 - t / left.top)} y2={TOP + PLOT * (1 - t / left.top)} />
          {sides.map((side) => {
            const value = scale[side].ticks[k];
            return (
              <text
                key={side}
                className="bar-chart__tick"
                x={side === 'left' ? SIDE - 6 : width - SIDE + 6}
                y={yOf(side, value)}
                dy="0.32em"
                textAnchor={side === 'left' ? 'end' : 'start'}
                style={{ fill: colorOf(side) }}
              >
                {formatNumber(value / scale[side].factor, scale[side].digits)}
              </text>
            );
          })}
        </g>
      ))}
      {/* Each axis' unit above it, in its series' colour */}
      {sides.map((side) => (
        <text
          key={side}
          className="bar-chart__axis-unit"
          x={side === 'left' ? 0 : width}
          y={TOP - 20}
          textAnchor={side === 'left' ? 'start' : 'end'}
          style={{ fill: colorOf(side) }}
        >
          {axes[side].label}
          {scale[side].unit && ` (${scale[side].unit})`}
        </text>
      ))}
      {categories.map((c, i) => {
        const x0 = SIDE + i * slot + (slot - group) / 2;
        const [range, unit] = splitUnit(c.label);
        return (
          <g key={c.key} className={active === i ? 'is-active' : undefined} onPointerEnter={() => onActive(i)}>
            <rect className="bar-chart__band" x={SIDE + i * slot} y={0} width={slot} height={height} />
            {series.map((s, k) => {
              const value = c.values[s.id] ?? 0;
              const h = Math.max(value > 0 ? 1.5 : 0, TOP + PLOT - yOf(s.axis, value));
              const x = x0 + k * (column + 3);
              const text = showValues && valueText(s.axis, value);
              return (
                <g key={s.id}>
                  <rect x={x} y={TOP + PLOT - h} width={column} height={h} rx={2} style={{ fill: s.color }} />
                  {text && (
                    <text className="bar-chart__value" x={x + column / 2} y={TOP + PLOT - h - 4} textAnchor="middle">
                      {text}
                    </text>
                  )}
                </g>
              );
            })}
            {tilted ? (
              <text
                className="bar-chart__label"
                transform={`translate(${SIDE + (i + 0.5) * slot + 4},${TOP + PLOT + 12}) rotate(-${TILT})`}
                textAnchor="end"
              >
                {c.label}
              </text>
            ) : (
              <text className="bar-chart__label" x={SIDE + (i + 0.5) * slot} y={TOP + PLOT + 16} textAnchor="middle">
                {range}
                {unit && (
                  <tspan className="bar-chart__unit" x={SIDE + (i + 0.5) * slot} dy="1.2em">
                    {unit}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
      <line className="bar-chart__baseline" x1={SIDE} x2={width - SIDE} y1={TOP + PLOT} y2={TOP + PLOT} />
    </svg>
  );
}

/**
 * Columns for a few categories, two series side by side, each on an axis of its own: e.g. the power (left) and the
 * number of units (right) per size class. The axes share their grid lines; hovering a category shows its values.
 *
 * categories: [{ key, label, values: { [series.id]: number }, details: [{ id, text }] (the tooltip's value per series) }]
 * series:     [{ id, label, color, ink (its axis' numbers, if darker than the columns), axis: 'left' | 'right' }]
 * axes:       { left: { label, kind: 'power', unit: 'MW' }, right: { label, kind: 'count' } } – power in its unit (GW
 *             from 1,000 MW), counts in thousands from 10,000 and millions from a million
 */
export default function GroupedBarChart({ categories, series, axes, label }) {
  const frameRef = useRef(null);
  const width = useWidth(frameRef);
  const [active, setActive] = useState(null);
  const current = active != null ? categories[active] : null;

  return (
    <div className="bar-chart" ref={frameRef} role="img" aria-label={label}>
      {width > 0 && <Columns width={width} categories={categories} series={series} axes={axes} active={active} onActive={setActive} />}
      {current && (
        <div className="bar-chart__tooltip" role="presentation">
          <div className="bar-chart__tooltip-title">{current.label}</div>
          {series.map((s) => (
            <div key={s.id} className="bar-chart__tooltip-row">
              <span className="bar-chart__swatch" style={{ background: s.color }} />
              <span>{s.label}</span>
              <strong>{current.details?.find((d) => d.id === s.id)?.text}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
