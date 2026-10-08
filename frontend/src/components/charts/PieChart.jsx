import { useState } from 'react';
import { formatShare } from '../../lib/format';
import './PieChart.css';

const SIZE = 200;
const OUTER = 96;
const INNER = 58;
const C = SIZE / 2;

// A point on the circle, angle in turns from the top, clockwise
const at = (turn, radius) => [C + radius * Math.sin(2 * Math.PI * turn), C - radius * Math.cos(2 * Math.PI * turn)];

// A name in the middle of the ring: at most two lines of about 16 characters, broken at spaces and after "/"
function centreLines(text) {
  const words = String(text).split(/(?<=\/)|\s+/);
  const lines = [''];
  for (const word of words) {
    const line = lines.at(-1);
    if (line && line.length + word.length > 16) lines.push(word);
    else lines[lines.length - 1] = line ? `${line}${line.endsWith('/') ? '' : ' '}${word}` : word;
  }
  return lines.length > 2 ? [lines[0], `${lines[1]}…`] : lines;
}

// One slice of the ring from turn a to turn b (less than a whole one)
function slicePath(a, b) {
  const large = b - a > 0.5 ? 1 : 0;
  const [x0, y0] = at(a, OUTER);
  const [x1, y1] = at(b, OUTER);
  const [x2, y2] = at(b, INNER);
  const [x3, y3] = at(a, INNER);
  return `M${x0} ${y0}A${OUTER} ${OUTER} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${INNER} ${INNER} 0 ${large} 0 ${x3} ${y3}Z`;
}

/**
 * A ring of slices with its legend: each slice's share of the whole, its value beside it. Hovering a slice or its line
 * of the legend shows it in the middle. slices: [{ id, label, value, color }] in their order; formatValue: a value as
 * text ("32,3 GWh"); total: what the middle says without a slice ({ value, label }); label: what the ring shows, for
 * screen readers
 */
export default function PieChart({ title, slices, formatValue, total, label }) {
  const [active, setActive] = useState(null);
  const sum = slices.reduce((t, s) => t + (s.value > 0 ? s.value : 0), 0);
  let turn = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const share = s.value / sum;
      const arc = { ...s, share, from: turn, to: turn + share };
      turn += share;
      return arc;
    });
  const shown = arcs.find((a) => a.id === active);

  return (
    <figure className="pie">
      {title && <figcaption className="pie__title">{title}</figcaption>}
      <svg
        className="pie__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${label}: ${arcs.map((a) => `${a.label} ${formatShare(a.share)}`).join(', ')}`}
      >
        {arcs.map((a) =>
          a.share > 0.99999 ? (
            // The whole ring: two halves (an arc can't close on itself)
            <g key={a.id} className={`pie__slice${active && active !== a.id ? ' is-dim' : ''}`} fill={a.color}>
              <path d={slicePath(0, 0.5)} />
              <path d={slicePath(0.5, 1)} />
              <title>{`${a.label}: ${formatShare(a.share)} · ${formatValue(a.value)}`}</title>
            </g>
          ) : (
            <path
              key={a.id}
              className={`pie__slice${active && active !== a.id ? ' is-dim' : ''}`}
              d={slicePath(a.from, a.to)}
              fill={a.color}
              onPointerEnter={() => setActive(a.id)}
              onPointerLeave={() => setActive(null)}
            >
              <title>{`${a.label}: ${formatShare(a.share)} · ${formatValue(a.value)}`}</title>
            </path>
          ),
        )}
        <text className="pie__centre-value" x={C} y={C - 2} textAnchor="middle">
          {shown ? formatShare(shown.share) : total?.value}
        </text>
        <text className="pie__centre-label" x={C} y={C + 18} textAnchor="middle">
          {centreLines(shown ? shown.label : total?.label ?? '').map((line, i) => (
            <tspan key={line} x={C} dy={i ? '1.2em' : 0}>
              {line}
            </tspan>
          ))}
        </text>
      </svg>
      <ul className="pie__legend">
        {slices.map((s) => (
          <li
            key={s.id}
            className={`pie__item${active === s.id ? ' is-active' : ''}`}
            onPointerEnter={() => s.value > 0 && setActive(s.id)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="pie__swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="pie__label" title={s.label}>
              {s.label}
            </span>
            <span className="pie__share">{sum ? formatShare(s.value / sum) : '—'}</span>
            <span className="pie__value">{formatValue(s.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
