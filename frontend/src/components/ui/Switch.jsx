// An on/off switch with its label to the right (hideLabel: only for screen readers, where a box names it: Setting).
// hint: what "on" means, as its tooltip.
export default function Switch({ label, checked, onChange, hint, hideLabel = false }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" title={hint} onClick={() => onChange(!checked)}>
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className={hideLabel ? 'visually-hidden' : 'switch__label'}>{label}</span>
    </button>
  );
}
