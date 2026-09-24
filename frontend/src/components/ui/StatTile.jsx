// status: 'loading' | 'ready' | 'empty'
export default function StatTile({ label, value, unit, sub, icon: Icon, status = 'ready', textValue = false }) {
  const isEmpty = status === 'empty' || value == null;
  const valueClass = ['stat-tile__value', textValue && 'stat-tile__value--text', isEmpty && 'stat-tile__value--empty']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="stat-tile">
      <div className="stat-tile__head">
        {Icon && (
          <span className="stat-tile__icon" aria-hidden="true">
            <Icon size={15} />
          </span>
        )}
        <span>{label}</span>
      </div>
      {status === 'loading' ? (
        <div className="skeleton skeleton--value" aria-label="Wird geladen" />
      ) : (
        <div className={valueClass} title={isEmpty ? undefined : `${value}${unit ? ` ${unit}` : ''}`}>
          {isEmpty ? '—' : value}
          {!isEmpty && unit && <span className="stat-tile__unit">{unit}</span>}
        </div>
      )}
      <div className="stat-tile__sub">{sub}</div>
    </div>
  );
}
