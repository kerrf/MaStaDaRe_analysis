import AggregateControl from '../../components/charts/AggregateControl';
import ListSelect from '../../components/ui/ListSelect';
import SegmentedControl from '../../components/ui/SegmentedControl';
import { ALL, LAST_12, MAX_COMPARED, MONTHS, TIME_VIEWS, comparedSpan, yearSpan } from './timeView';

const yearOptions = (years) => years.map((year) => ({ value: year, label: String(year) }));

// From – to: two lists of years, each only with what fits the other (maxSpan: the most years between them), and a
// shortcut beside them (all: its label and whether it is the choice now)
function YearSpan({ years, from, to, onChange, maxSpan = Infinity, all }) {
  return (
    <div className="year-span" role="group" aria-label="Zeitraum">
      <div className="year-span__field">
        <span aria-hidden="true">von</span>
        <ListSelect
          label="von"
          className="timeline__select year-span__select"
          value={from}
          onChange={(year) => onChange(year, to)}
          options={yearOptions(years.filter((year) => year <= to && to - year < maxSpan))}
        />
      </div>
      <div className="year-span__field">
        <span aria-hidden="true">bis</span>
        <ListSelect
          label="bis"
          className="timeline__select year-span__select"
          value={to}
          onChange={(year) => onChange(from, year)}
          options={yearOptions(years.filter((year) => year >= from && year - from < maxSpan))}
        />
      </div>
      {all && (
        <button type="button" className={`year-span__all${all.active ? ' is-active' : ''}`} aria-pressed={all.active} onClick={all.onClick}>
          {all.label}
        </button>
      )}
    </div>
  );
}

/**
 * The time controls of a chart (timeView.js): aggregiert (bars or curve), the Zeitraster – Jährlich, Monatlich or
 * Jahresvergleich – and the span: the years from–to with a shortcut to every year, the months (the last 12, all, one
 * year), or the years compared (at most MAX_COMPARED). Their lists are dropdowns of their own (ListSelect): the
 * browser's own list of a <select> came out cut off and didn't scroll.
 * time: useTimeView(); since, latestYear: the data's first and last year; now: for dates ahead (planned units) the current
 * month – the months then start there ("Nächste 12 Monate"), the comparison with this year
 */
export default function TimeControls({ time, since, latestYear, now = null }) {
  const all = Array.from({ length: Math.max(latestYear - since + 1, 0) }, (_, i) => since + i);
  const [from, to] = yearSpan(time.years, since, latestYear);
  const every = !time.years || (from === since && to === latestYear);
  // A span that is every year again is no choice any more: "Alle Jahre" lights up
  const setSpan = (nextFrom, nextTo) => time.setYears(nextFrom === since && nextTo === latestYear ? null : [nextFrom, nextTo]);
  const [compareFrom, compareTo] = comparedSpan(time.compared, since, latestYear, now);

  return (
    <>
      <AggregateControl aggregiert={time.aggregiert} onAggregiert={time.setAggregiert} style={time.style} onStyle={time.setStyle} />
      <SegmentedControl
        label="Zeitraster"
        options={TIME_VIEWS.map((v) => (v.id === 'vergleich' ? { ...v, title: 'Die Monate mehrerer Jahre nebeneinander: der Zubau' } : v))}
        value={time.view}
        onChange={time.setView}
      />
      {time.view === 'monat' && (
        <ListSelect
          label="Zeitraum"
          className="timeline__select"
          value={time.range}
          onChange={time.setRange}
          options={[
            { value: LAST_12, label: now ? 'Nächste 12 Monate' : 'Letzte 12 Monate' },
            {
              value: ALL,
              label: now ? `Alle Monate ab ${MONTHS[now.month - 1]} ${now.year}` : `Alle Monate seit ${since}`,
            },
            ...[...all].reverse().map((year) => ({ value: String(year), label: String(year) })),
          ]}
        />
      )}
      {time.view === 'jahr' && (
        <YearSpan
          years={all}
          from={from}
          to={to}
          onChange={setSpan}
          all={{ label: `Alle Jahre seit ${since}`, active: every, onClick: () => time.setYears(null) }}
        />
      )}
      {time.view === 'vergleich' && (
        <YearSpan
          years={all}
          from={compareFrom}
          to={compareTo}
          maxSpan={MAX_COMPARED}
          onChange={(nextFrom, nextTo) => time.setCompared([nextFrom, nextTo])}
        />
      )}
    </>
  );
}
