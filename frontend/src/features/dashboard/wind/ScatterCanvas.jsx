import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '../../../lib/format';
import { niceTicks } from './turbines';

const CELL = 10; // px of the grid that finds the point under the pointer
const HIT = 8; // px: a point this close counts as hovered
// Turbines of one model share their sizes exactly: thousands of dots on one spot. Each moves by up to this share of the
// plot, the same way every time (from its index), so a model reads as a small cloud as dense as it is common.
const JITTER = 0.006;
const jitter = (k, salt) => {
  const s = Math.sin((k + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 2 * JITTER;
};

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Every turbine as a dot, on a canvas (tens of thousands), the axes in SVG over it, a tooltip for the dot under the
 * pointer. xs, ys: the values (NaN: left out); group: the colour index of each point, colors: the palette; xMax, yMax:
 * the axes' ends; describe(k): the tooltip's title and rows for point k. compact: a small plot – fewer ticks, the axes'
 * names left to its caption. height: of the plot area with its axes; square: as high as wide. note: in the plot's top
 * left corner, above the dots (the correlation).
 */
export default function ScatterCanvas({
  xs,
  ys,
  group,
  colors,
  xMax,
  yMax,
  xLabel,
  yLabel,
  describe,
  height = 340,
  square = false,
  compact = false,
  note,
  label,
}) {
  const frame = useRef(null);
  const canvas = useRef(null);
  const width = useWidth(frame);
  const [hover, setHover] = useState(null);

  const margin = compact ? { top: 6, right: 6, bottom: 20, left: 32 } : { top: 14, right: 12, bottom: 40, left: 48 };
  const h = square ? width : height;
  const pw = Math.max(0, width - margin.left - margin.right);
  const ph = Math.max(0, h - margin.top - margin.bottom);
  const xTicks = niceTicks(xMax, compact ? 3 : 6);
  const yTicks = niceTicks(yMax, compact ? 3 : 5);
  const [xEnd, yEnd] = [xTicks.at(-1), yTicks.at(-1)];
  const sx = (v) => margin.left + (v / xEnd) * pw;
  const sy = (v) => margin.top + ph - (v / yEnd) * ph;
  // Where point k is drawn: its values, jittered
  const px = (k) => sx(Math.min(xs[k], xEnd)) + jitter(k, 1) * pw;
  const py = (k) => sy(Math.min(ys[k], yEnd)) + jitter(k, 2) * ph;

  // The points on the canvas, in the device's resolution; a grid of them for the pointer
  const index = useMemo(() => new Map(), []);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !width) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = h * ratio;
    const ctx = element.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, h);
    index.clear();
    const r = compact ? 1.4 : xs.length > 20000 ? 1.8 : 2.4;
    ctx.globalAlpha = xs.length > 5000 ? 0.55 : 0.8;
    for (let k = 0; k < xs.length; k += 1) {
      const [x, y] = [xs[k], ys[k]];
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      const [cx, cy] = [px(k), py(k)];
      ctx.fillStyle = colors[group[k]];
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      const key = `${Math.floor(cx / CELL)},${Math.floor(cy / CELL)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, ys, group, colors, width, h, xEnd, yEnd, compact]);

  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const [mx, my] = [event.clientX - rect.left, event.clientY - rect.top];
    let best = null;
    let bestD = HIT * HIT;
    const [cx, cy] = [Math.floor(mx / CELL), Math.floor(my / CELL)];
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        for (const k of index.get(`${cx + i},${cy + j}`) ?? []) {
          const d = (px(k) - mx) ** 2 + (py(k) - my) ** 2;
          if (d < bestD) [best, bestD] = [k, d];
        }
      }
    }
    setHover(best);
  };

  const tip = hover != null && describe ? describe(hover) : null;
  const [hx, hy] = hover != null ? [px(hover), py(hover)] : [0, 0];
  return (
    <div className="scatter" ref={frame} style={{ height: h || undefined }}>
      <canvas ref={canvas} className="scatter__canvas" style={{ width, height: h }} />
      {width > 0 && (
        <svg className="scatter__axes" width={width} height={h} role="img" aria-label={label} onPointerMove={pick} onPointerLeave={() => setHover(null)}>
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line className="scatter__grid" x1={margin.left} x2={margin.left + pw} y1={sy(t)} y2={sy(t)} />
              <text className="scatter__tick" x={margin.left - 6} y={sy(t)} dy="0.32em" textAnchor="end">
                {formatNumber(t, t % 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={`x${t}`} className="scatter__tick" x={sx(t)} y={margin.top + ph + 14} textAnchor="middle">
              {formatNumber(t, t % 1 ? 1 : 0)}
            </text>
          ))}
          <line className="scatter__baseline" x1={margin.left} x2={margin.left + pw} y1={margin.top + ph} y2={margin.top + ph} />
          {!compact && (
            <>
              <text className="scatter__axis-label" x={margin.left + pw} y={h - 4} textAnchor="end">
                {xLabel}
              </text>
              <text className="scatter__axis-label" x={margin.left} y={margin.top - 4} textAnchor="start">
                {yLabel}
              </text>
            </>
          )}
          {hover != null && <circle className="scatter__hover" cx={hx} cy={hy} r={5} />}
        </svg>
      )}
      {note && width > 0 && (
        <div className="scatter__note" style={{ left: margin.left + 8, top: margin.top + 6 }}>
          {note}
        </div>
      )}
      {tip && (
        <div className="scatter__tooltip" style={{ left: hx, top: hy, transform: `translate(${hx > width / 2 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
          <div className="scatter__tooltip-title">{tip.title}</div>
          {tip.rows.map(([name, value]) => (
            <div key={name} className="scatter__tooltip-row">
              <span>{name}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
