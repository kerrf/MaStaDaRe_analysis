import { useId, useLayoutEffect, useRef, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { signed } from './model';

// The small charts of the page Überblick: a trend beside a number (a line or bars), a change as a chip, the peers on a
// strip, a target as a bullet. Each as wide as its box, with the value of the point under the pointer above it.

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

// The value under the pointer: what it is, the value, at x (centred above it, kept inside the box)
function Tip({ tip, width }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 60), Math.max(60, width - 60));
  return (
    <div className="mini-tip" style={{ left }} role="status">
      <span>{tip.label}</span>
      <b className="tabular">{tip.value}</b>
    </div>
  );
}

// The index of the slot under the pointer, of n slots across the width
const slotAt = (event, n) => {
  const box = event.currentTarget.getBoundingClientRect();
  return Math.min(n - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * n)));
};

/**
 * A trend as a line over a light area from 0, its last point a dot: the Bestand at the end of each year.
 * points: [{ key, label, value }]; format(value): the value as text; axis: the labels below its ends ([from, to]).
 */
export function Spark({ points, format, axis, height = 46, label }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const [active, setActive] = useState(null);
  const n = points.length;
  const max = Math.max(...points.map((p) => p.value), 0) || 1;
  const pad = 5; // room for the dot at the ends
  const x = (i) => pad + (n > 1 ? (i * (width - 2 * pad)) / (n - 1) : (width - 2 * pad) / 2);
  const y = (value) => 4 + (height - 6) * (1 - value / max);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join('');
  const area = n > 1 ? `${line}L${x(n - 1)},${height}L${x(0)},${height}Z` : '';
  const shown = active ?? n - 1;
  return (
    <div className="mini-chart" ref={ref}>
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={(e) => setActive(slotAt(e, n))}
          onPointerLeave={() => setActive(null)}
        >
          <path className="spark__area" d={area} />
          <path className="spark__line" d={line} />
          {active != null && <line className="spark__cursor" x1={x(active)} x2={x(active)} y1={0} y2={height} />}
          <circle className="spark__dot" cx={x(shown)} cy={y(points[shown].value)} r={3.5} />
        </svg>
      )}
      <Tip tip={active != null && { x: x(active), label: points[active].label, value: format(points[active].value) }} width={width} />
      {axis && (
        <div className="mini-axis" aria-hidden="true">
          <span>{axis[0]}</span>
          <span>{axis[1]}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A trend as bars: the Zubau of each year (or month), the one the page is about in colour, the others grey; a period
 * still running hatched. bars: [{ key, label, tick, value, partial }]; highlight: the key in full colour (none:
 * all of them); ticks: 'ends' (the first and last tick below the bars) or 'all'; color: of the bars (default: the
 * dashboard's).
 */
export function SparkBars({ bars, format, highlight, color = 'var(--accent)', ticks = 'ends', height = 46, label }) {
  const ref = useRef(null);
  const patternId = `bars-${useId().replace(/[^\w-]/g, '')}`;
  const width = useWidth(ref);
  const [active, setActive] = useState(null);
  const n = bars.length;
  const max = Math.max(...bars.map((b) => b.value ?? 0), 0) || 1;
  const slot = n ? width / n : 0;
  const barWidth = Math.max(2, Math.min(16, slot - 2)); // 2 px between the bars
  const y = (value) => height - 1 - (height - 3) * (value / max);
  return (
    <div className="mini-chart" ref={ref} style={{ '--bars-color': color }}>
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={(e) => setActive(slotAt(e, n))}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <pattern id={patternId} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" className="spark-bars__hatch-ground" />
              <rect width="1.6" height="4" className="spark-bars__hatch" />
            </pattern>
          </defs>
          <line className="spark-bars__base" x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} />
          {bars.map((b, i) => {
            const value = Math.max(0, b.value ?? 0);
            if (!(value > 0)) return null;
            const top = y(value);
            const h = height - 1 - top;
            const left = i * slot + (slot - barWidth) / 2;
            const r = Math.min(2, barWidth / 2, h);
            const strong = highlight == null || b.key === highlight;
            return (
              <path
                key={b.key}
                className={`spark-bars__bar${strong ? ' is-strong' : ''}${active === i ? ' is-active' : ''}`}
                d={`M${left},${height - 1}V${top + r}Q${left},${top} ${left + r},${top}H${left + barWidth - r}Q${left + barWidth},${top} ${left + barWidth},${top + r}V${height - 1}Z`}
                style={b.partial ? { fill: `url(#${patternId})` } : undefined}
              />
            );
          })}
        </svg>
      )}
      <Tip tip={active != null && { x: (active + 0.5) * slot, label: bars[active].label, value: format(bars[active].value ?? 0) }} width={width} />
      {ticks === 'all' ? (
        <div className="mini-axis mini-axis--all" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {bars.map((b) => (
            <span key={b.key}>{b.tick}</span>
          ))}
        </div>
      ) : (
        <div className="mini-axis" aria-hidden="true">
          <span>{bars[0]?.tick}</span>
          <span>{bars.at(-1)?.tick}</span>
        </div>
      )}
    </div>
  );
}

/**
 * A change as a chip – up green, down red, within 1 % grey – and what it is measured against beside it. value: the
 * change (0.1 = +10 %); null: only the text. children: the chip's own text instead of the change (a rank).
 */
export function Delta({ value, label, children, flat = 0.01 }) {
  const tone = children ? 'flat' : value > flat ? 'up' : value < -flat ? 'down' : 'flat';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : null;
  return (
    <div className="delta-row">
      {(children || value != null) && (
        <span className={`delta delta--${tone}`}>
          {Icon && <Icon size={13} strokeWidth={2.4} aria-hidden="true" />}
          <span className="tabular">{children ?? signed(value)}</span>
        </span>
      )}
      {label && <span className="delta-row__label">{label}</span>}
    </div>
  );
}

/**
 * The peers on a line from 0: each a dot, the area in scope larger in the dashboard's colour, the area above them a
 * mark. peers: [{ key, value }]; own: the key in scope (none for Germany); reference: the value of the area above;
 * nameOf(key), format(value).
 */
export function PeerStrip({ peers, own, reference, referenceLabel, nameOf, format, height = 30, axis, label }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const [active, setActive] = useState(null);
  const max = Math.max(...peers.map((p) => p.value), reference ?? 0) || 1;
  const pad = 7;
  const x = (value) => pad + ((width - 2 * pad) * value) / max;
  const mid = height / 2;
  // The peer nearest the pointer
  const pick = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = event.clientX - box.left;
    const nearest = peers.reduce((best, p) => (Math.abs(x(p.value) - at) < Math.abs(x(best.value) - at) ? p : best), peers[0]);
    setActive(nearest.key);
  };
  const ownPeer = peers.find((p) => p.key === own);
  const activePeer = peers.find((p) => p.key === active);
  return (
    <div className="mini-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerMove={pick} onPointerLeave={() => setActive(null)}>
          <line className="peers__axis" x1={pad} x2={width - pad} y1={mid} y2={mid} />
          {reference != null && <line className="peers__reference" x1={x(reference)} x2={x(reference)} y1={mid - 9} y2={mid + 9} />}
          {peers.map(
            (p) =>
              p.key !== own && (
                <circle key={p.key} className={`peers__dot${p.key === active ? ' is-active' : ''}`} cx={x(p.value)} cy={mid} r={p.key === active ? 5 : 4} />
              ),
          )}
          {ownPeer && <circle className="peers__own" cx={x(ownPeer.value)} cy={mid} r={6} />}
        </svg>
      )}
      <Tip tip={activePeer && { x: x(activePeer.value), label: nameOf(activePeer.key), value: format(activePeer.value) }} width={width} />
      <div className="mini-axis" aria-hidden="true">
        <span>{axis?.[0]}</span>
        {reference != null && (
          <span className="peers__legend">
            <i aria-hidden="true" />
            {referenceLabel}
          </span>
        )}
        <span>{axis?.[1]}</span>
      </div>
    </div>
  );
}

/**
 * A target as a bullet: the Bestand filled, where the pace of the last year leads by the goal's year hatched beyond it,
 * the goal at the end of the track, an earlier goal on the way as a mark. All in MW; format(value) as text.
 */
export function Bullet({ installed, goal, milestone, projected, format, label }) {
  const ref = useRef(null);
  const patternId = `bullet-${useId().replace(/[^\w-]/g, '')}`;
  const width = useWidth(ref);
  const max = Math.max(goal.value, projected ?? 0, installed) * 1.02;
  const x = (value) => (width * Math.max(0, value)) / max;
  const [top, h] = [22, 16]; // the track below the goal's label
  const height = top + h + 22; // and the earlier goal's label below it
  const clampLabel = (at) => Math.min(Math.max(at, 40), width - 40);
  return (
    <div className="bullet" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <defs>
            <pattern id={patternId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" className="bullet__hatch-ground" />
              <rect width="2" height="5" className="bullet__hatch" />
            </pattern>
          </defs>
          <rect className="bullet__track" x={0} y={top} width={width} height={h} rx={3} />
          {projected > installed && <rect x={x(installed)} y={top} width={x(projected) - x(installed)} height={h} style={{ fill: `url(#${patternId})` }} />}
          <rect className="bullet__fill" x={0} y={top} width={x(Math.min(installed, max))} height={h} rx={3} />
          {milestone && (
            <g className="bullet__milestone">
              <line x1={x(milestone.value)} x2={x(milestone.value)} y1={top - 3} y2={top + h + 3} />
              <text x={clampLabel(x(milestone.value))} y={top + h + 16} textAnchor="middle">
                Ziel {milestone.year}: {format(milestone.value)}
              </text>
            </g>
          )}
          <g className="bullet__goal">
            <line x1={x(goal.value)} x2={x(goal.value)} y1={top - 6} y2={top + h + 3} />
            <text x={Math.min(x(goal.value), width)} y={top - 9} textAnchor={x(goal.value) > width - 80 ? 'end' : 'middle'}>
              Ziel {goal.year}: {format(goal.value)}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
