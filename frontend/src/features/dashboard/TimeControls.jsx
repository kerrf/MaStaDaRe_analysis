import AggregateControl from '../../components/charts/AggregateControl';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ALL, LAST_12, TIME_VIEWS, yearSpan } from './timeView';

/**
 * The time controls of a chart (timeView.js): aggregiert (bars or curve), Jährlich or Monatlich, and the span – the
 * years from–to with a shortcut to every year, or the months (the last 12, all, one year). id: for the labels' ids;
 * time: useTimeView(); since, latestYear: the data's first and last year
 */
export default function TimeControls({ id, time, since, latestYear }) {
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
        <>
          <label className="visually-hidden" htmlFor={`${id}-range`}>
            Zeitraum
          </label>
          <select id={`${id}-range`} className="timeline__select" value={time.range} onChange={(e) => time.setRange(e.target.value)}>
            <option value={LAST_12}>Letzte 12 Monate</option>
            <option value={ALL}>Alle Monate seit {since}</option>
            {[...all].reverse().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </>
      ) : (
        <div className="year-span" role="group" aria-label="Zeitraum">
          <label className="year-span__field">
            <span>von</span>
            <select className="timeline__select year-span__select" value={from} onChange={(e) => setSpan(Number(e.target.value), to)}>
              {all
                .filter((year) => year <= to)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </label>
          <label className="year-span__field">
            <span>bis</span>
            <select className="timeline__select year-span__select" value={to} onChange={(e) => setSpan(from, Number(e.target.value))}>
              {all
                .filter((year) => year >= from)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className={`year-span__all${every ? ' is-active' : ''}`} aria-pressed={every} onClick={() => time.setYears(null)}>
            Alle Jahre seit {since}
          </button>
        </div>
      )}
    </>
  );
}
