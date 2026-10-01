import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatAmount, formatNumber } from '../../lib/format';
import './StackedChart.css';

const HEIGHT = 300;
const MARGIN = { top: 24, right: 8, bottom: 28, left: 44 };
const MAX_BAR_WIDTH = 56;
// Width of an x-axis label per character (11.5px font), to keep the labels apart
const CHAR_WIDTH = 7;
const NICE = [1, 2, 2.5, 5, 10];
const LABEL_EVERY = [1, 2, 3, 5, 10, 20, 50];

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

// Axis ticks from 0 in steps of 1, 2, 2.5 or 5 times a power of ten, up to at least max.
function niceTicks(max, target = 5) {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = NICE.map((f) => f * power).find((s) => s >= rough);
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, i) => i * step);
}

// Fraction digits an axis step needs: 2.5 -> 1, 0.25 -> 2
const digitsOf = (step) => [0, 1, 2].find((d) => Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-6) ?? 3;

// Tangents of a monotone cubic curve through the points (Steffen's method, like d3.curveMonotoneX): it never overshoots
// between two points, so stacked areas keep their order.
function tangents(xs, ys) {
  const n = xs.length;
  const slope = (i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  if (n === 2) return [slope(0), slope(0)];
  const t = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const [s0, s1] = [slope(i - 1), slope(i)];
    const [h0, h1] = [xs[i] - xs[i - 1], xs[i + 1] - xs[i]];
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
  }
  t[0] = (3 * slope(0) - t[1]) / 2;
  t[n - 1] = (3 * slope(n - 2) - t[n - 2]) / 2;
  return t;
}

// Cubic segments through the points, from the first to the last or, reversed, back
function curve(xs, ys, reversed = false) {
  const t = tangents(xs, ys);
  const order = reversed ? [...xs.keys()].reverse() : [...xs.keys()];
  let path = '';
  for (let k = 1; k < order.length; k += 1) {
    const [a, b] = [order[k - 1], order[k]];
    const dx = (xs[b] - xs[a]) / 3;
    path += `C${xs[a] + dx},${ys[a] + dx * t[a]} ${xs[b] - dx},${ys[b] - dx * t[b]} ${xs[b]},${ys[b]}`;
  }
  return path;
}

// The top segment of a bar, with rounded top corners
function roundedTop(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/**
 * Stacked bars or stacked areas over equally spaced periods, or lines side by side, with a tooltip per period.
 *
 * periods: [{ key, label (tooltip title), tick (axis label, or null), partial (drawn lighter), values: { [series.id]: number | null } }]
 * series:  [{ id, label, color }], stacked in this order, the first at the bottom
 * kind:    'bars' | 'area' (both stacked) | 'lines' (not stacked, e.g. shares)
 * unit:    unit of the values, 'MW' or 'MWh' (from 1,000 on, the axis switches to GW or GWh), '%', or a count such as
 *          'Anzahl' (from 10,000 on, the axis counts in thousands)
 * formatValue: how the tooltip writes a value; default: with unit, in GW from 1,000 MW on
 */
export default function StackedChart({ periods, series, kind = 'bars', unit, label, formatValue = (value) => formatAmount(value, unit) }) {
  const frameRef = useRef(null);
  const width = useWidth(frameRef);
  const [activeKey, setActiveKey] = useState(null);

  // Bottom and top of each series' segment, per period
  const stacks = useMemo(
    () =>
      periods.map((period) => {
        let top = 0;
        return series.map((s) => {
          const value = period.values[s.id];
          const bottom = top;
          top += Math.max(0, value ?? 0);
          return { value, bottom, top };
        });
      }),
    [periods, series],
  );
  const totalOf = (j) => stacks[j].at(-1)?.top ?? 0;
  const hasData = (j) => series.some((s) => periods[j].values[s.id] != null);

  const n = periods.length;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = n ? plotWidth / n : 0;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot >= 8 ? slot * 0.7 : Math.max(1, slot - 1));
  const cx = (j) => MARGIN.left + (j + 0.5) * slot;

  const stacked = kind !== 'lines';
  const max = stacked
    ? stacks.reduce((m, _, j) => Math.max(m, totalOf(j)), 0)
    : stacks.reduce((m, segments) => Math.max(m, ...segments.map((seg) => seg.value ?? 0)), 0);
  const ticks = niceTicks(max);
  const domainTop = ticks.at(-1);
  const y = (value) => MARGIN.top + plotHeight * (1 - value / domainTop);
  const power = /^M/.test(unit);
  const large = power ? domainTop >= 1000 : unit !== '%' && domainTop >= 10000;
  const axisUnit = !large ? unit : power ? unit.replace(/^M/, 'G') : 'Tsd.';
  const tickDigits = digitsOf((large ? ticks[1] / 1000 : ticks[1]) || 1);

  // x-axis labels: as many as fit, every 1st, 2nd, 5th … of them; year labels on round years
  const labelled = periods.flatMap((p, j) => (p.tick ? [j] : []));
  const labelGap = labelled.length > 1 ? (labelled[1] - labelled[0]) * slot : plotWidth;
  const labelWidth = Math.max(0, ...labelled.map((j) => periods[j].tick.length)) * CHAR_WIDTH + 12;
  const every = LABEL_EVERY.find((e) => e * labelGap >= labelWidth) ?? LABEL_EVERY.at(-1);
  const showLabel = (tick, k) => (/^\d{4}$/.test(tick) ? Number(tick) : k) % every === 0;

  // Areas run through the periods that have data (a year in progress ends at its latest month)
  const withData = periods.flatMap((_, j) => (hasData(j) ? [j] : []));
  const asArea = kind === 'area' && withData.length > 1;

  const active = periods.findIndex((p) => p.key === activeKey);
  const pickAt = (clientX, element) => {
    const j = Math.floor((clientX - element.getBoundingClientRect().left - MARGIN.left) / slot);
    setActiveKey(j >= 0 && j < n && hasData(j) ? periods[j].key : null);
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') setActiveKey(null);
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const at = withData.indexOf(active);
    const next = event.key === 'ArrowRight' ? (at < 0 ? 0 : at + 1) : at < 0 ? withData.length - 1 : at - 1;
    const j = withData[Math.min(withData.length - 1, Math.max(0, next))];
    if (j != null) setActiveKey(periods[j].key);
  };

  return (
    <div className="stacked-chart" ref={frameRef}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={(e) => pickAt(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pickAt(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActiveKey(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActiveKey(null)}
        >
          <g className="stacked-chart__grid">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
                <text className="stacked-chart__tick" x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {formatNumber(large ? t / 1000 : t, tickDigits)}
                </text>
              </g>
            ))}
            <text className="stacked-chart__unit" x={MARGIN.left - 8} y={MARGIN.top - 12} textAnchor="end">
              {axisUnit}
            </text>
          </g>

          {active >= 0 && !asArea && kind !== 'lines' && (
            <rect className="stacked-chart__hover" x={MARGIN.left + active * slot} y={MARGIN.top} width={slot} height={plotHeight} />
          )}

          {kind === 'lines' &&
            series.map((s, i) => {
              // Each line through the periods it has a value for
              const points = periods.flatMap((_, j) => (stacks[j][i].value != null ? [j] : []));
              if (!points.length) return null;
              const xs = points.map(cx);
              const ys = points.map((j) => y(stacks[j][i].value));
              return (
                <g key={s.id} className="stacked-chart__line" style={{ color: s.color }}>
                  <path d={`M${xs[0]},${ys[0]}${xs.length > 1 ? curve(xs, ys) : ''}`} />
                  {n <= 40 && xs.map((x, k) => <circle key={points[k]} cx={x} cy={ys[k]} r={2.5} />)}
                </g>
              );
            })}

          {kind === 'lines'
            ? null
            : asArea
            ? series.map((s, i) => {
                const xs = withData.map(cx);
                const tops = withData.map((j) => y(stacks[j][i].top));
                const bottoms = withData.map((j) => y(stacks[j][i].bottom));
                const d = `M${xs[0]},${tops[0]}${curve(xs, tops)}L${xs.at(-1)},${bottoms.at(-1)}${curve(xs, bottoms, true)}Z`;
                return <path key={s.id} className="stacked-chart__area" d={d} style={{ fill: s.color }} />;
              })
            : periods.map((period, j) => {
                const segments = stacks[j];
                const topIndex = segments.findLastIndex((seg) => seg.top > seg.bottom);
                const x = cx(j) - barWidth / 2;
                return (
                  <g key={period.key} className={period.partial ? 'is-partial' : undefined}>
                    {segments.map((seg, i) => {
                      if (seg.top <= seg.bottom) return null;
                      const [top, bottom] = [y(seg.top), y(seg.bottom)];
                      const style = { fill: series[i].color };
                      return i === topIndex ? (
                        <path key={series[i].id} d={roundedTop(x, top, barWidth, bottom - top, 3)} style={style} />
                      ) : (
                        <rect key={series[i].id} x={x} y={top} width={barWidth} height={bottom - top} style={style} />
                      );
                    })}
                  </g>
                );
              })}

          {active >= 0 && (asArea || kind === 'lines') && (
            <g className="stacked-chart__cursor">
              <line x1={cx(active)} x2={cx(active)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
              {series.map((s, i) => {
                const { value, top } = stacks[active][i];
                if (!stacked && value == null) return null;
                return <circle key={s.id} cx={cx(active)} cy={y(stacked ? top : value)} r={4} style={{ fill: s.color }} />;
              })}
            </g>
          )}

          <line className="stacked-chart__baseline" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} />
          {periods.map((period, j) => {
            const k = labelled.indexOf(j);
            return (
              period.tick &&
              showLabel(period.tick, k) && (
                <text key={period.key} className="stacked-chart__tick" x={cx(j)} y={HEIGHT - 8} textAnchor="middle">
                  {period.tick}
                </text>
              )
            );
          })}
        </svg>
      )}

      {active >= 0 && (
        <div
          className="stacked-chart__tooltip"
          style={{
            left: cx(active),
            transform: cx(active) > width / 2 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)',
          }}
        >
          <div className="stacked-chart__tooltip-title">{periods[active].label}</div>
          <table>
            <tbody>
              {/* Top of the stack first, as drawn */}
              {series
                .map((s, i) => ({ s, value: stacks[active][i].value }))
                .reverse()
                .map(({ s, value }) => (
                  <tr key={s.id}>
                    <th>
                      <span className="stacked-chart__swatch" style={{ background: s.color }} />
                      {s.label}
                    </th>
                    <td>{formatValue(value)}</td>
                  </tr>
                ))}
            </tbody>
            {stacked && series.length > 1 && (
              <tfoot>
                <tr>
                  <th>Gesamt</th>
                  <td>{formatAmount(totalOf(active), unit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {series.length === 0 && <div className="stacked-chart__empty">Alle Reihen ausgeblendet – in der Legende wieder einblenden.</div>}
    </div>
  );
}
