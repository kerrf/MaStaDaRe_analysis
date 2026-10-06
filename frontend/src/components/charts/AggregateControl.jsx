import Switch from '../ui/Switch';

const STYLES = [
  { id: 'balken', label: 'Balken' },
  { id: 'kurve', label: 'Kurve' },
];

// The "aggregiert" switch (the Bestand instead of the Zubau) and, once on, below it in the same box: the aggregated
// values as bars or as a curve
export default function AggregateControl({ aggregiert, onAggregiert, style, onStyle }) {
  return (
    <div className={`aggregate${aggregiert ? ' is-on' : ''}`}>
      <Switch label="aggregiert" checked={aggregiert} onChange={onAggregiert} hint="Aufsummiert: der Bestand statt des Zubaus" />
      {aggregiert && (
        <div className="aggregate__style" role="radiogroup" aria-label="Darstellung">
          {STYLES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === style}
              className={`aggregate__option${id === style ? ' is-active' : ''}`}
              onClick={() => onStyle(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
