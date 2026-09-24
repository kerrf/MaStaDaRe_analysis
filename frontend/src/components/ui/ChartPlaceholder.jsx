import { Construction } from 'lucide-react';

const BAR_HEIGHTS = [38, 52, 44, 66, 58, 74, 62, 86, 70, 92, 80, 100];

function Art({ variant }) {
  if (variant === 'line') {
    return (
      <svg className="placeholder__line" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points="0,88 30,84 60,80 90,74 120,70 150,60 180,52 210,40 240,30 270,18 300,8"
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  if (variant === 'rows') {
    return (
      <div className="placeholder__rows" aria-hidden="true">
        {[92, 78, 70, 61, 55, 47, 40, 33].map((w) => (
          <div key={w} className="placeholder__row" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  return BAR_HEIGHTS.map((h, i) => <div key={i} className="placeholder__bar" style={{ height: `${h}%` }} aria-hidden="true" />);
}

export default function ChartPlaceholder({ variant = 'bars', title = 'In Vorbereitung', note, height }) {
  return (
    <div className="placeholder" style={height ? { height } : undefined}>
      <div className="placeholder__art">
        <Art variant={variant} />
      </div>
      <div className="placeholder__label">
        <Construction size={18} aria-hidden="true" />
        <strong>{title}</strong>
        {note && <span>{note}</span>}
      </div>
    </div>
  );
}
