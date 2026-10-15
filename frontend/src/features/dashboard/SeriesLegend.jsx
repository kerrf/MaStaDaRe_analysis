// The legend below a stacked chart: a click on a series hides or shows it
export default function SeriesLegend({ series, hidden, onToggle }) {
  return (
    <div className="timeline-legend" role="group" aria-label="Datenreihen ein- und ausblenden">
      {series.map((s) => {
        const off = hidden.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={`timeline-legend__item${off ? ' is-off' : ''}`}
            aria-pressed={!off}
            title={off ? `${s.label} einblenden` : `${s.label} ausblenden`}
            onClick={() => onToggle(s.id)}
          >
            <span className="timeline-legend__dot" style={{ background: off ? undefined : s.color }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
