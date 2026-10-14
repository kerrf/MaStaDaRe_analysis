import AggregateControl from '../../components/charts/AggregateControl';
import ListSelect from '../../components/ui/ListSelect';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ALL, LAST_12, TIME_VIEWS, yearSpan } from './timeView';

const yearOptions = (years) => years.map((year) => ({ value: year, label: String(year) }));

/**
 * The time controls of a chart (timeView.js): aggregiert (bars or curve), Jährlich or Monatlich, and the span – the
 * years from–to with a shortcut to every year, or the months (the last 12, all, one year). Their lists are dropdowns
 * of their own (ListSelect): the browser's own list of a <select> came out cut off and didn't scroll.
 * time: useTimeView(); since, latestYear: the data's first and last year
 */
export default function TimeControls({ time, since, latestYear }) {
  const all = Array.from({ length: Math.max(latestYear - since + 1, 0) }, (_, i) => since + i);
  const [from, to] = yearSpan(time.years, since, latestYear);
  const every = !time.years || (from === since && to === latestYear);
  // A span that is every year again is no choice any more: "Alle Jahre" lights up
  const setSpan = (nextFrom, nextTo) => time.setYears(nextFrom === since && nextTo === latestYear ? null : [nextFrom, nextTo]);

  return (
    <>
      <AggregateControl aggregiert={time.aggregiert} onAggregiert={time.setAggregiert} style={time.style} onStyle={time.setStyle} />
      <SegmentedControl label="Zeitraster" options={TIME_VIEWS} value={time.view} onChange={time.setView} />
      {time.view === 'monat' ? (
        <ListSelect
          label="Zeitraum"
          className="timeline__select"
          value={time.range}
          onChange={time.setRange}
          options={[
            { value: LAST_12, label: 'Letzte 12 Monate' },
            { value: ALL, label: `Alle Monate seit ${since}` },
            ...[...all].reverse().map((year) => ({ value: String(year), label: String(year) })),
          ]}
        />
      ) : (
        <div className="year-span" role="group" aria-label="Zeitraum">
          <div className="year-span__field">
            <span aria-hidden="true">von</span>
            <ListSelect
              label="von"
              className="timeline__select year-span__select"
              value={from}
              onChange={(year) => setSpan(year, to)}
              options={yearOptions(all.filter((year) => year <= to))}
            />
          </div>
          <div className="year-span__field">
            <span aria-hidden="true">bis</span>
            <ListSelect
              label="bis"
              className="timeline__select year-span__select"
              value={to}
              onChange={(year) => setSpan(from, year)}
              options={yearOptions(all.filter((year) => year >= from))}
            />
          </div>
          <button type="button" className={`year-span__all${every ? ' is-active' : ''}`} aria-pressed={every} onClick={() => time.setYears(null)}>
            Alle Jahre seit {since}
          </button>
        </div>
      )}
    </>
  );
}
