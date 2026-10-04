// disabled: the whole control, e.g. a choice that only applies to another setting (hint: why, as its tooltip)
export default function SegmentedControl({ label, options, value, onChange, disabled = false, hint }) {
  return (
    <div className={`segmented${disabled ? ' is-disabled' : ''}`} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || option.disabled}
            title={(disabled && hint) || option.title || option.label}
            className={`segmented__option${active ? ' is-active' : ''}`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
