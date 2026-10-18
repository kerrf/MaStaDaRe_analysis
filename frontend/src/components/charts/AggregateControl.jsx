import SegmentedControl from '../ui/SegmentedControl';
import Setting from '../ui/Setting';
import Switch from '../ui/Switch';

const STYLES = [
  { id: 'balken', label: 'Balken' },
  { id: 'kurve', label: 'Kurve' },
];

// "Aggregiert" (the Bestand instead of the Zubau) in a box like every setting, and beside the switch the aggregated
// values as bars or as a curve – out of use while it is off, so nothing moves; always bars first, each time it is
// switched on
export default function AggregateControl({ aggregiert, onAggregiert, style, onStyle }) {
  const toggle = (on) => {
    onAggregiert(on);
    if (on) onStyle('balken');
  };
  return (
    <Setting label="Aggregiert" className="aggregate">
      <Switch label="aggregiert" hideLabel checked={aggregiert} onChange={toggle} hint="Aufsummiert: der Bestand statt des Zubaus" />
      <SegmentedControl
        label="Darstellung"
        options={STYLES}
        value={aggregiert ? style : null}
        onChange={onStyle}
        disabled={!aggregiert}
        hint="Mit »aggregiert«: der Bestand als Balken oder als Kurve"
      />
    </Setting>
  );
}
