import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import StackedChart from '../../../components/charts/StackedChart';
import { hatchOf } from '../../../lib/colorScale';
import { ChartFoot } from '../../../components/ui/ChartExport';
import { formatCount, formatNumber, formatPercent } from '../../../lib/format';
import { FootnoteContext } from '../footnoteContext';
import { FootnoteRef } from '../footnotes';
import { asOfName, formatOf, inPeriod, joined, percent, periodName, signed } from './model';

// The blocks of the page Überblick, the same on the page and in its PDF report (report: without links and exports)

// ------------------------------------------------------------------------------------------------------- Tiles
// A number large, with its line of context
function TileValue({ value, unit, sub }) {
  return (
    <div className="ov-tile__part">
      <div className="ov-tile__value tabular">
        {value}
        {unit && <span className="ov-tile__unit">{unit}</span>}
      </div>
      {sub && <div className="ov-tile__sub">{sub}</div>}
    </div>
  );
}

// One number on its own card: what it is, the number large, one line of context; second: another number beside it, the
// same thing seen another way (the Zubau and the growth it made), a dashed line between them and the card wider
function Tile({ label, value, unit, sub, note, tone, second }) {
  return (
    <div className={`card ov-tile${tone ? ` ov-tile--${tone}` : ''}${second ? ' ov-tile--wide' : ''}`}>
      <div className="ov-tile__label">
        {label}
        {note}
      </div>
      <div className="ov-tile__values">
        <TileValue value={value} unit={unit} sub={sub} />
        {second && <TileValue {...second} />}
      </div>
    </div>
  );
}

/**
 * The numbers of the period, each on its card: the Bestand at its end (with its share and rank among its peers), the
 * units, the Zubau (with the growth of the Bestand it made), the Zubau against the year before, the planned units.
 */
export function Tiles({ model, overview, scope }) {
  const { measure, total, change, comparison, planned } = model;
  const format = formatOf(measure.format);
  const [one, many] = overview.units ?? ['Anlage', 'Anlagen'];
  const noun = (n) => (n === 1 ? one : many);
  const small = measure.format === 'capacity' ? 'kWh' : 'kW';
  const growthLine = `Bestand seit Ende ${periodName(model.start)}${total.removed > 0.0005 ? ` · ${joined(format(total.removed))} stillgelegt` : ''}`;
  const tiles = [
    {
      id: 'bestand',
      label: measure.label,
      note: <FootnoteRef id="bestand" />,
      ...format(total.value),
      sub:
        comparison?.share != null
          ? `${percent(comparison.share)} von ${scope.parentName} · Rang ${comparison.rank.rank} von ${comparison.rank.of}`
          : [asOfName(model), total.also != null && `Leistung ${joined(formatOf(overview.also.format)(total.also))}`].filter(Boolean).join(' · '),
    },
    {
      id: 'units',
      label: `${many} in Betrieb`,
      value: formatCount(total.units),
      sub: total.avgSize != null ? `Ø ${formatNumber(total.avgSize, total.avgSize < 10 ? 1 : 0)} ${small} je ${one}` : null,
    },
    {
      id: 'zubau',
      label: `Zubau ${periodName(model.period)}`,
      ...format(total.added),
      value: `+${format(total.added).value}`,
      sub: total.addedUnits
        ? `${formatCount(total.addedUnits)} ${noun(total.addedUnits)}${total.avgNew != null ? `, Ø ${formatNumber(total.avgNew, total.avgNew < 10 ? 1 : 0)} ${small}` : ''}`
        : 'nichts Neues',
      // What it did to the Bestand: the growth since the period's start, net of what was decommissioned
      // (its line sits under "In Planung" where that is shown)
      second: total.growth != null && {
        value: signed(total.growth),
        sub: planned ? null : growthLine,
      },
    },
    change &&
      (change.change != null || change.minor) && {
        id: 'change',
        label: 'Zubau ggü. Vorjahr',
        value: change.minor ? 'kaum' : signed(change.change),
        tone: change.minor || Math.abs(change.change) < 0.05 ? null : change.change > 0 ? 'up' : 'down',
        sub: `${change.nowLabel}: ${joined(format(change.now))} · ${change.beforeLabel}: ${joined(format(change.before))}`,
      },
    planned && {
      id: 'planned',
      label: 'In Planung',
      note: <FootnoteRef id="geplant" />,
      ...format(planned.value),
      sub: (
        <>
          <span>
            {planned.units ? `${formatCount(planned.units)} ${noun(planned.units)}${planned.to ? ` · bis ${planned.to}` : ''}` : 'keine im Register'}
          </span>
          {total.growth != null && <span>{growthLine}</span>}
        </>
      ),
    },
  ].filter(Boolean);
  // One row, the wide card half as wide again as the others
  const template = tiles.map((t) => (t.second ? '1.5fr' : '1fr')).join(' ');
  return (
    <div className="ov-tiles" style={{ '--ov-template': template }}>
      {tiles.map(({ id, ...tile }) => (
        <Tile key={id} {...tile} />
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

// A share as a slim bar in the part's colour, the number beside it
function ShareBar({ share, label }) {
  return (
    <div className="ov-art__share" title={`${percent(share)} ${label}`}>
      <span className="ov-art__bar" aria-hidden="true">
        <i style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
      </span>
      <span>
        <b className="tabular">{percent(share)}</b> {label}
      </span>
    </div>
  );
}

// The Zubau of the period relative to the Bestand at its start: "+7,8 % in 2026"; "neu" where there was none before
function Growth({ growth, added, model, title }) {
  if (growth == null) return added > 0 ? <div className="ov-art__growth is-up">neu {inPeriod(model)}</div> : null;
  return (
    <div className={`ov-art__growth${growth > 0 ? ' is-up' : ''}`} title={title}>
      {growth > 0 && <TrendingUp size={14} aria-hidden="true" />}
      <span className="tabular">+{percent(growth)}</span> {inPeriod(model)}
    </div>
  );
}

/**
 * The Arten side by side, each a column read from top to bottom: its name, its units and its measure, each with its
 * share of all and its Zubau in the period relative to its Bestand at the period's start.
 */
export function PartsSection({ model, overview, scopeName, csv }) {
  const { measure, parts } = model;
  const shown = parts.filter((p) => p.units > 0 || p.value > 0);
  if (shown.length < 2) return null;
  const format = formatOf(measure.format);
  const [, many] = overview.units ?? ['Anlage', 'Anlagen'];
  const measureName = measure.label.replace('Installierte ', '');
  const before = model.period.month ? 'dem Vormonat' : model.period.year - 1;
  const hinted = shown.some((p) => p.hint);
  return (
    <Section
      title={overview.title}
      lead={`${scopeName} · Bestand ${asOfName(model)}, je Art ihr Anteil und ihr Zubau ${inPeriod(model)} gemessen am Bestand davor`}
      csv={csv}
      className="ov-parts"
    >
      <ul className="ov-arten" style={{ '--ov-arten': shown.length }}>
        {shown.map((p) => {
          const value = format(p.value);
          return (
            <li key={p.id} className="ov-art" style={{ '--part-color': p.color, '--part-pattern': p.hatch ? hatchOf(p) : undefined }}>
              <div className="ov-art__head">
                <strong>
                  {p.label}
                  {p.id === 'balkon' && <FootnoteRef id="balkon" />}
                </strong>
                {/* Every column a line for it, so their numbers stand at the same height */}
                {hinted && <span>{p.hint ?? '\u00a0'}</span>}
              </div>
              <div className="ov-art__metric">
                <span className="ov-art__label">{many}</span>
                <span className="ov-art__value tabular">{formatCount(p.units)}</span>
                <ShareBar share={p.shareUnits} label={`aller ${many}`} />
                <Growth
                  growth={p.growthUnits}
                  added={p.addedUnits}
                  model={model}
                  title={`${formatCount(p.addedUnits)} ${many} neu, ${percent(p.growthUnits ?? 0)} mehr als Ende ${before}`}
                />
              </div>
              <div className="ov-art__metric">
                <span className="ov-art__label">{measureName}</span>
                <span className="ov-art__value tabular">
                  {value.value}
                  <small>{value.unit}</small>
                </span>
                <ShareBar share={p.shareValue} label={`der ${measureName}`} />
                <Growth growth={p.growthValue} added={p.added} model={model} title={`${joined(format(p.added))} neu`} />
                {p.also != null && <span className="ov-art__also">Leistung {joined(formatOf(overview.also.format)(p.also))}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The Zubau per year up to the year chosen, or per month of the year with the month chosen. */
export function ZubauSection({ model, scopeName, csv, moreHref }) {
  const { measure, chart, total, period, running } = model;
  const format = formatOf(measure.format);
  const unit = measure.format === 'capacity' ? 'MWh' : 'MW';
  const series = model.parts.map((p) => ({ id: p.id, label: p.label, color: p.color, hatch: p.hatch }));
  const byMonth = chart.mode === 'months';
  const shown = byMonth ? 'je Monat' : 'je Jahr';
  return (
    <Section
      title={byMonth ? `Zubau je Monat ${period.year}` : 'Zubau je Jahr'}
      lead={`${scopeName} · neu in Betrieb, ${shown}${byMonth ? `, ${periodName(period)} hervorgehoben` : ''}${chart.periods.some((p) => p.partial) ? ', bis heute hell' : ''}`}
      csv={csv}
    >
      <StackedChart periods={chart.periods} series={series} kind="bars" unit={unit} label={`Zubau ${shown} in ${scopeName}`} />
      {series.length > 1 && (
        <ul className="ov-legend" aria-label="Farben">
          {series.map((s) => (
            <li key={s.id}>
              <i style={{ background: s.hatch ? hatchOf(s) : s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <p className="ov-note">
        <strong className="tabular">{joined(format(total.added))}</strong> {inPeriod(model)}
        {running && ' bis heute'}. Die letzten Monate steigen noch: viele Anlagen werden erst Wochen nach der Inbetriebnahme registriert.
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

// A target reached as a bar: value 0..1 (beyond 1 full); mark: { at, label } – an earlier goal on the way
function Progress({ value, mark, label }) {
  return (
    <div className="ov-progress" role="img" aria-label={label}>
      <span className="ov-progress__fill" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
      {mark && (
        <span className="ov-progress__mark" style={{ left: `${Math.min(1, mark.at) * 100}%` }}>
          <span className="ov-progress__mark-label">{mark.label}</span>
        </span>
      )}
    </div>
  );
}

// The pace of the last full year against what the target needs from then on
function PaceChip({ ratio }) {
  if (ratio == null) return <span className="ov-chip ov-chip--up">Ziel erreicht</span>;
  const tone = ratio >= 1 ? 'up' : ratio >= 0.6 ? 'fair' : 'poor';
  return <span className={`ov-chip ov-chip--${tone}`}>{formatPercent(ratio)} des nötigen Tempos</span>;
}

/** Germany: the national targets at the period's end, in Bruttoleistung. */
export function TargetsSection({ model, csv }) {
  const { targets } = model;
  const format = formatOf('power');
  return (
    <Section
      title={
        <>
          Ausbauziel {targets[0].goal.year}
          <FootnoteRef id="ziele" />
        </>
      }
      lead={`Stand ${asOfName(model)}, Bruttoleistung`}
      csv={csv}
    >
      {targets.map((t) => (
        <div key={t.id} className="ov-target">
          <div className="ov-target__row">
            <span>
              {targets.length > 1 && <span className="ov-target__name">{t.label}</span>}
              <strong className="tabular">{joined(format(t.installed))}</strong> von {joined(format(t.goal.value))}
            </span>
            <strong className="ov-target__pct tabular">{formatPercent(t.installed / t.goal.value)}</strong>
          </div>
          <Progress
            value={t.installed / t.goal.value}
            mark={t.milestone && { at: t.milestone.value / t.goal.value, label: `Ziel ${t.milestone.year}` }}
            label={`${t.label}: ${formatPercent(t.installed / t.goal.value)} des Ziels ${t.goal.year}`}
          />
          <p className="ov-target__pace">
            <PaceChip ratio={t.pace.ratio} />
            <span>
              Zubau {t.pace.year}: <span className="tabular">{joined(format(t.pace.actual))}</span> · nötig:{' '}
              <span className="tabular">{joined(format(t.pace.needed))}</span> je Jahr
            </span>
          </p>
        </div>
      ))}
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
