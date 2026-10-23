import { useContext } from 'react';
import { Link } from 'react-router-dom';
import StackedChart from '../../../components/charts/StackedChart';
import { hatchOf } from '../../../lib/colorScale';
import { ChartFoot } from '../../../components/ui/ChartExport';
import { formatCount, formatNumber, formatPercent } from '../../../lib/format';
import { FootnoteContext } from '../footnoteContext';
import { FootnoteRef } from '../footnotes';
import { Bullet, Delta, PeerStrip, Spark, SparkBars } from './charts';
import { MONTHS, asOfName, formatOf, inPeriod, joined, percent, periodName, signed } from './model';

// The blocks of the page Überblick, the same on the page and in its PDF report (report: without links and exports)

// The words of a measure: its unit for the axes, its name without "Installierte"
const unitOf = (measure) => (measure.format === 'capacity' ? 'MWh' : 'MW');
const nameOf = (measure) => measure.label.replace('Installierte ', '');
// The growth of the units since the period's start, net of the decommissioned
const unitsGrowth = (total) => (total.startUnits > 0 ? (total.units - total.startUnits) / total.startUnits : null);
// What a year of the trends is called: "2026 (bis heute)", "2025 (bis März)"
const yearName = (model, h) =>
  h.year !== model.period.year || !h.partial ? String(h.year) : model.running ? `${h.year} (bis heute)` : `${h.year} (bis ${MONTHS[model.period.month - 1]})`;

// ------------------------------------------------------------------------------------------------------- Cards
// One number per card, each read the same way: what it is, the number large, how it changed (a chip, and against
// what), its trend as a small chart, one line of context
function Card({ label, note, value, unit, delta, chart, foot }) {
  return (
    <div className="card kpi">
      <div className="kpi__label">
        {label}
        {note}
      </div>
      <div className="kpi__value">
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </div>
      {delta}
      <div className="kpi__chart">{chart}</div>
      {foot && <div className="kpi__foot">{foot}</div>}
    </div>
  );
}

/**
 * The numbers of the period, each on its card with its trend: the Bestand at its end and its units (the line of the
 * last 15 years), the Zubau in it against the year before (bars per year, or per month), the Bestand per inhabitant
 * among the peers (a strip), the planned units by their year – for a period past the Stilllegungen in it.
 * history, trailing, peers: from historyOf, trailingMonths, peersOf; placeName(key): a Land's or Kreis's name.
 */
export function Cards({ model, overview, scope, history, trailing, peers, placeName }) {
  const { measure, total, change, comparison, planned, period } = model;
  const format = formatOf(measure.format);
  const text = (value) => joined(format(value));
  const [one, many] = overview.units ?? ['Anlage', 'Anlagen'];
  const noun = (n) => (n === 1 ? one : many);
  const small = measure.format === 'capacity' ? 'kWh' : 'kW';
  const since = `seit Ende ${periodName(model.start)}`;
  const axis = [String(history[0].year), model.running ? 'heute' : periodName(period)];
  const endOf = (h) => (h.year !== period.year ? `Ende ${h.year}` : model.running ? 'Heute' : `Ende ${periodName(period)}`);
  const yearBars = (pick) => history.map((h) => ({ key: String(h.year), label: yearName(model, h), tick: String(h.year), value: pick(h), partial: h.partial }));
  // A growth: against what, or – without a Bestand before – all new
  const growth = (value) => (value != null ? <Delta value={value} label={since} /> : <Delta label={`neu ${inPeriod(model)}`} />);

  // The Zubau: per year up to the year, or per month up to the month
  const zubauBars = period.month
    ? trailing.periods.map((p) => ({ key: p.key, label: p.label, tick: p.tick, value: Object.values(p.values).reduce((a, b) => a + (b ?? 0), 0), partial: p.partial }))
    : yearBars((h) => h.added);
  let zubauDelta = null;
  if (change?.change != null) zubauDelta = <Delta value={change.change} label={`ggü. ${change.vsLabel}`} />;
  else if (change?.minor) zubauDelta = <Delta label="kaum Zubau, kein Vergleich" />;
  else if (model.running && period.month) zubauDelta = <Delta label="Monat läuft noch" />;

  // Per inhabitant: power in W, capacity in Wh
  const headUnit = measure.format === 'capacity' ? 'Wh' : 'W';
  const headValue = (v) => formatNumber(v, v < 10 ? 1 : 0);
  const head = (v) => `${headValue(v)} ${headUnit}`;
  const peersName = scope.kind === 'kreis' ? 'Kreisen' : 'Ländern';

  const removedUnits = Math.max(0, total.startUnits + total.addedUnits - total.units);
  const cards = [
    {
      id: 'bestand',
      label: measure.label,
      note: <FootnoteRef id="bestand" />,
      ...format(total.value),
      delta: growth(total.growth),
      chart: <Spark points={history.map((h) => ({ key: h.key, label: endOf(h), value: h.value }))} format={text} axis={axis} label={`${measure.label} je Jahr`} />,
      foot:
        comparison?.share != null
          ? `${percent(comparison.share)} von ${scope.parentName} · Rang ${comparison.rank.rank} von ${comparison.rank.of}`
          : total.also != null
            ? `Leistung ${joined(formatOf(overview.also.format)(total.also))} · Stand ${asOfName(model)}`
            : `netto · Stand ${asOfName(model)}`,
    },
    {
      id: 'units',
      label: `${many} in Betrieb`,
      value: formatCount(total.units),
      delta: growth(unitsGrowth(total)),
      chart: <Spark points={history.map((h) => ({ key: h.key, label: endOf(h), value: h.units }))} format={formatCount} axis={axis} label={`${many} je Jahr`} />,
      foot: total.avgSize != null ? `Ø ${formatNumber(total.avgSize, total.avgSize < 10 ? 1 : 0)} ${small} je ${one}` : null,
    },
    {
      id: 'zubau',
      label: `Zubau ${periodName(period)}`,
      ...format(total.added),
      value: `+${format(total.added).value}`,
      delta: zubauDelta,
      chart: (
        <SparkBars
          bars={zubauBars}
          highlight={zubauBars.at(-1).key}
          format={text}
          label={period.month ? 'Zubau je Monat' : 'Zubau je Jahr'}
        />
      ),
      foot: total.addedUnits
        ? `${formatCount(total.addedUnits)} ${noun(total.addedUnits)}${total.avgNew != null ? ` · Ø ${formatNumber(total.avgNew, total.avgNew < 10 ? 1 : 0)} ${small}` : ''}`
        : 'nichts Neues',
    },
    peers?.value != null && {
      id: 'head',
      label: 'Je Einwohner',
      value: headValue(peers.value),
      unit: headUnit,
      delta: peers.own ? (
        <Delta label={`unter ${peers.peers.length} ${peersName}`}>Rang {peers.rank}</Delta>
      ) : (
        <Delta label={`Länder: ${head(peers.peers.at(-1).value)} bis ${head(peers.peers[0].value)}`} />
      ),
      chart: (
        <PeerStrip
          peers={peers.peers}
          own={peers.own?.key}
          reference={peers.reference}
          referenceLabel={scope.kind === 'de' ? 'Deutschland' : scope.parentName}
          nameOf={placeName}
          format={head}
          axis={['0', head(peers.peers[0].value)]}
          label={`${measure.label} je Einwohner im Vergleich der ${scope.kind === 'kreis' ? 'Kreise' : 'Länder'}`}
        />
      ),
      foot: peers.own ? `${scope.parentName}: ${head(peers.reference)}` : `Vorn: ${placeName(peers.peers[0].key)}`,
    },
    planned
      ? {
          id: 'planned',
          label: 'In Planung',
          note: <FootnoteRef id="geplant" />,
          ...format(planned.value),
          delta: <Delta label="nach geplanter Inbetriebnahme" />,
          chart: <SparkBars bars={planned.byYear} format={text} ticks="all" label="In Planung je Jahr der geplanten Inbetriebnahme" />,
          foot: planned.units ? `${formatCount(planned.units)} ${noun(planned.units)}${planned.to ? ` · bis ${planned.to}` : ''}` : 'keine im Register',
        }
      : {
          id: 'removed',
          label: `Stilllegungen ${periodName(period)}`,
          ...format(total.removed),
          delta: <Delta label={total.start > 0 ? `${percent(total.removed / total.start)} des Bestands Ende ${periodName(model.start)}` : null} />,
          chart: <SparkBars bars={yearBars((h) => h.removed)} highlight={String(period.year)} format={text} label="Stilllegungen je Jahr" />,
          foot: removedUnits ? `${formatCount(removedUnits)} ${noun(removedUnits)}` : 'keine',
        },
  ].filter(Boolean);
  return (
    <div className="kpis" style={{ '--kpis': cards.length }}>
      {cards.map(({ id, ...card }) => (
        <Card key={id} {...card} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- Sections
/** A section of the page: a card with a head (title, lead, something on the right) and its exports in the foot. */
export function Section({ title, lead, aside, csv, className = '', children }) {
  return (
    <section className={`card ov-section ${className}`}>
      <header className="ov-section__head">
        <div>
          <h3 className="ov-section__title">{title}</h3>
          {lead && <p className="ov-section__lead">{lead}</p>}
        </div>
        {aside}
      </header>
      <div className="ov-section__body">{children}</div>
      {csv && <ChartFoot csv={csv} className="ov-section__foot" />}
    </section>
  );
}

// The head of a chart: what it shows and over which time, its number, its change
function PanelHead({ title, span, value, delta }) {
  return (
    <div className="ov-panel__head">
      <div className="ov-panel__title">
        <strong>{title}</strong>
        <span>{span}</span>
      </div>
      <div className="ov-panel__value">{value}</div>
      {delta}
    </div>
  );
}

/**
 * The Zubau two ways side by side: the last 12 months, each against the same month a year before, and their sum
 * against the 12 before them; the years up to the period's, its own against the year before (a month's: the year up to
 * it, ytd).
 */
export function ZubauSection({ model, scopeName, history, trailing, ytd, csv, moreHref }) {
  const { measure, change, period } = model;
  const format = formatOf(measure.format);
  const unit = unitOf(measure);
  const series = model.parts.map((p) => ({ id: p.id, label: p.label, color: p.color, hatch: p.hatch }));
  const years = history.map((h) => ({
    key: h.key,
    label: yearName(model, h),
    tick: String(h.year),
    partial: h.partial,
    values: Object.fromEntries(model.parts.map((p) => [p.id, h.parts[p.id].added])),
  }));
  // The same month a year before, for the complete months
  const reference = { label: 'Vorjahresmonat', values: Object.fromEntries(trailing.periods.filter((p) => !p.partial).map((p) => [p.key, p.before])) };
  const thisYear = history.at(-1);
  // The year's change: up to the month against the same months a year before, or the page's
  const yearChange = period.month ? ytd : change;
  return (
    <Section title="Zubau" lead={`${scopeName} · neu in Betrieb, netto`} csv={csv} className="ov-zubau">
      <div className="ov-612">
        <div className="ov-panel">
          <PanelHead
            title={trailing.wholeYear ? 'Je Monat' : 'Letzte 12 Monate'}
            span={trailing.span}
            value={joined(format(trailing.now))}
            delta={<Delta value={trailing.change} label={trailing.wholeYear ? `ggü. ${trailing.wholeYear - 1}` : 'ggü. den 12 Monaten davor'} />}
          />
          <StackedChart
            periods={trailing.periods}
            series={series}
            kind="bars"
            unit={unit}
            height={250}
            reference={reference}
            label={`Zubau je Monat in ${scopeName}, die letzten 12 Monate`}
          />
        </div>
        <div className="ov-panel">
          <PanelHead
            title="Je Jahr"
            span={`${years[0].key} – ${yearName(model, thisYear)}`}
            value={joined(format(thisYear.added))}
            delta={yearChange?.change != null ? <Delta value={yearChange.change} label={`ggü. ${yearChange.vsLabel}`} /> : null}
          />
          <StackedChart periods={years} series={series} kind="bars" unit={unit} height={250} label={`Zubau je Jahr in ${scopeName}`} />
        </div>
      </div>
      <ul className="ov-legend" aria-label="Legende">
        {series.length > 1 &&
          series.map((s) => (
            <li key={s.id}>
              <i style={{ background: s.hatch ? hatchOf(s) : s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        <li>
          <i className="ov-legend__line" aria-hidden="true" />
          Vorjahresmonat
        </li>
      </ul>
      <p className="ov-note">
        Hell: noch nicht abgeschlossen. Die letzten Monate steigen noch: viele Anlagen werden erst Wochen nach der Inbetriebnahme
        registriert.
        {moreHref && (
          <>
            {' '}
            <Link to={moreHref}>Mehr zum Zubau</Link>
          </>
        )}
      </p>
    </Section>
  );
}

// A share as a slim bar in the part's colour, the number beside it
function Share({ share }) {
  return (
    <div className="ov-mix__share">
      <span className="ov-mix__bar" aria-hidden="true">
        <i style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
      </span>
      <span className="tabular">{percent(share)}</span>
    </div>
  );
}

/**
 * The Arten as a table, one row each and the total below them: units and measure with their shares, the Zubau of the
 * period, the growth of the Bestand since the period's start, the Zubau per year as small bars.
 */
export function PartsTable({ model, overview, history, csv }) {
  const { measure, parts, total, period } = model;
  const shown = parts.filter((p) => p.units > 0 || p.value > 0);
  if (shown.length < 2) return null;
  const format = formatOf(measure.format);
  const text = (value) => joined(format(value));
  const alsoText = overview.also && ((value) => joined(formatOf(overview.also.format)(value)));
  const [one, many] = overview.units ?? ['Anlage', 'Anlagen'];
  const noun = (n) => (n === 1 ? one : many);
  const barsOf = (pick) => history.map((h) => ({ key: String(h.year), label: yearName(model, h), tick: String(h.year), value: pick(h), partial: h.partial }));
  const growth = (value, added) =>
    value != null ? <Delta value={value} /> : added > 0 ? <span className="delta delta--up">neu</span> : <span className="ov-mix__none">–</span>;
  const rows = [
    ...shown.map((p) => ({ ...p, bars: barsOf((h) => h.parts[p.id].added), barColor: p.hatch ?? p.color })),
    {
      id: 'total',
      label: 'Gesamt',
      ...total,
      shareUnits: null,
      shareValue: null,
      growthValue: total.growth,
      growthUnits: unitsGrowth(total),
      bars: barsOf((h) => h.added),
      barColor: 'var(--accent)',
    },
  ];
  return (
    <Section
      title={overview.title}
      lead={`Bestand ${asOfName(model)} · Zubau ${inPeriod(model)} · Wachstum des Bestands seit Ende ${periodName(model.start)}`}
      csv={csv}
      className="ov-parts"
    >
      <table className="ov-mix">
        <thead>
          <tr>
            <th scope="col">Art</th>
            <th scope="col">{many}</th>
            <th scope="col">{nameOf(measure)}</th>
            <th scope="col">Zubau {periodName(period)}</th>
            <th scope="col">Wachstum</th>
            <th scope="col" className="ov-mix__trend-head">
              Zubau je Jahr
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isTotal = r.id === 'total';
            return (
              <tr
                key={r.id}
                className={isTotal ? 'is-total' : undefined}
                style={isTotal ? undefined : { '--part-color': r.color, '--part-pattern': r.hatch ? hatchOf(r) : undefined }}
              >
                <th scope="row">
                  <span className="ov-mix__name">
                    {r.label}
                    {r.id === 'balkon' && <FootnoteRef id="balkon" />}
                  </span>
                  {r.hint && <span className="ov-mix__hint">{r.hint}</span>}
                </th>
                <td data-label={many}>
                  <span className="ov-mix__value tabular">{formatCount(r.units)}</span>
                  {r.shareUnits != null && <Share share={r.shareUnits} />}
                </td>
                <td data-label={nameOf(measure)}>
                  <span className="ov-mix__value tabular">{text(r.value)}</span>
                  {r.shareValue != null && <Share share={r.shareValue} />}
                  {alsoText && r.also != null && <span className="ov-mix__sub">Leistung {alsoText(r.also)}</span>}
                </td>
                <td data-label={`Zubau ${periodName(period)}`}>
                  <span className="ov-mix__value tabular">+{text(r.added)}</span>
                  <span className="ov-mix__sub tabular">
                    {formatCount(r.addedUnits)} {noun(r.addedUnits)}
                  </span>
                </td>
                <td data-label="Wachstum">
                  {growth(r.growthValue, r.added)}
                  {r.growthUnits != null && (
                    <span className="ov-mix__sub tabular">
                      {many} {signed(r.growthUnits)}
                    </span>
                  )}
                </td>
                <td data-label="Zubau je Jahr" className="ov-mix__trend">
                  <SparkBars bars={r.bars} highlight={String(period.year)} format={text} color={r.barColor} height={30} label={`Zubau je Jahr: ${r.label}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

// The pace of the last full year against what the target needs from then on
function PaceChip({ ratio }) {
  if (ratio == null) return <span className="ov-chip ov-chip--up">Ziel erreicht</span>;
  const tone = ratio >= 1 ? 'up' : ratio >= 0.6 ? 'fair' : 'poor';
  return <span className={`ov-chip ov-chip--${tone}`}>{formatPercent(ratio)} des nötigen Tempos</span>;
}

/**
 * Germany: the national targets at the period's end, in Bruttoleistung – each a bullet (the Bestand, where the pace of
 * the last full year leads by the goal's year, the goal) and its numbers: the pace, the pace needed, the outlook.
 */
export function TargetsSection({ model, csv }) {
  const { targets } = model;
  const format = formatOf('power');
  const text = (value) => joined(format(value));
  const { year } = targets[0].goal;
  return (
    <Section
      title={
        <>
          Ausbauziel {year}
          <FootnoteRef id="ziele" />
        </>
      }
      lead={`Bruttoleistung, Stand ${asOfName(model)}`}
      csv={csv}
      className="ov-targets"
    >
      {targets.map((t) => {
        const { reachedIn } = t.projection;
        const outlook =
          t.installed >= t.goal.value ? 'erreicht' : reachedIn == null ? 'ohne Zubau nie' : reachedIn <= t.goal.year ? `${reachedIn} erreicht` : `erst ${reachedIn}`;
        return (
          <div key={t.id} className="ov-target">
            <div className="ov-target__head">
              <div>
                {targets.length > 1 && <span className="ov-target__name">{t.label}</span>}
                <span className="ov-target__value tabular">{text(t.installed)}</span>
                <span className="ov-target__of">von {text(t.goal.value)}</span>
              </div>
              <strong className="ov-target__pct tabular">{formatPercent(t.installed / t.goal.value)}</strong>
            </div>
            <Bullet
              installed={t.installed}
              goal={t.goal}
              milestone={t.milestone}
              projected={t.projection.atGoal}
              format={text}
              label={`${t.label}: ${formatPercent(t.installed / t.goal.value)} des Ziels ${t.goal.year}`}
            />
            <dl className="ov-target__stats">
              <div>
                <dt>Zubau {t.pace.year}</dt>
                <dd className="tabular">{text(t.pace.actual)}</dd>
              </div>
              <div>
                <dt>Nötig je Jahr</dt>
                <dd className="tabular">{text(t.pace.needed)}</dd>
              </div>
              <div>
                <dt>Im Tempo {t.pace.year}</dt>
                <dd className="tabular">{outlook}</dd>
              </div>
            </dl>
            <PaceChip ratio={t.pace.ratio} />
          </div>
        );
      })}
      <ul className="ov-legend ov-legend--start" aria-label="Legende">
        <li>
          <i className="ov-legend__fill" aria-hidden="true" />
          Bestand
        </li>
        <li>
          <i className="ov-legend__hatch" aria-hidden="true" />
          bis Ende {year} im Tempo {targets[0].pace.year}
        </li>
      </ul>
    </Section>
  );
}

/** The page's remarks in the report, numbered as on the page. */
export function ReportNotes() {
  const notes = useContext(FootnoteContext)?.notes ?? [];
  if (!notes.length) return null;
  return (
    <div className="ov-report__notes">
      <h3>Anmerkungen</h3>
      <ol>
        {notes.map((note, i) => (
          <li key={note.id}>
            <span className="tabular">{i + 1}</span>
            <p>{note.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
