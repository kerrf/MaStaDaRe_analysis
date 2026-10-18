import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import StackedChart from '../../../components/charts/StackedChart';
import ChartPlaceholder from '../../../components/ui/ChartPlaceholder';
import { ChartFoot } from '../../../components/ui/ChartExport';
import { API_BASE_URL } from '../../../config/site';
import { statsUrl, useDatenstand, useJson, useStats } from '../../../lib/data';
import { fileName, round } from '../../../lib/files';
import { formatCount, formatNumber, formatPercent, formatShare } from '../../../lib/format';
import { useFootnote } from '../footnoteContext';
import { FootnoteRef } from '../footnotes';
import ScopeBar from '../ScopeBar';
import SelectionBar from '../SelectionBar';
import { byTechnology, formatOf, joined, pageModel, partsOf } from './model';
import './overview.css';

const FLAT = 0.05; // a change of the Zubau within ±5 % reads as "about the same"
// Shares below 1 % with two decimals: "0,37 %", not "0,4 %"
const percent = (share) => (share > 0 && share < 0.01 ? `${formatNumber(share * 100, 2)} %` : formatShare(share));

const TARGETS_NOTE =
  'Ausbauziele des Bundes: Solar und Wind an Land nach EEG 2023, § 4, Wind auf See nach WindSeeG, § 1 – in Bruttoleistung, ' +
  'wie das Gesetz sie zählt; alle anderen Werte der Seite netto. Der Strich auf dem Balken ist das Zwischenziel. Tempo: ' +
  'der Zubau des letzten vollen Jahres gegen den Zubau, den das Ziel von heute an in jedem Jahr braucht.';
const PLANNED_NOTE =
  'Einheiten „in Planung“ im Marktstammdatenregister, mit einem geplanten Inbetriebnahmedatum ab dem laufenden Monat, wie ' +
  'die Betreiber es angeben. Fast alle geplanten Windenergieanlagen haben ihre Genehmigung im Register; bei Solar fehlen ' +
  'viele Planungen, die nie gemeldet werden.';
const BALKON_NOTE =
  'Balkonkraftwerke: die als steckerfertige Solaranlage registrierten Einheiten – nur auf dieser Seite getrennt, sonst zählen ' +
  'sie zu „Gebäude“. Viele Balkonkraftwerke sind nicht registriert, manche als Gebäudeanlage (siehe Datenqualität): Die ' +
  'Zahl ist eine Untergrenze.';

// The Zubau of the last full year against the year before: up, about the same, or down
function ChangeChip({ change }) {
  if (change == null) return null;
  const tone = change >= FLAT ? 'up' : change <= -FLAT ? 'down' : 'flat';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : ArrowRight;
  return (
    <span className={`ov-chip ov-chip--${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {change > 0 ? '+' : change < 0 ? '−' : ''}
      {formatPercent(Math.abs(change))}
    </span>
  );
}

// The pace of the last full year against what the target needs from now on
function PaceChip({ ratio }) {
  if (ratio == null) return <span className="ov-chip ov-chip--up">Ziel erreicht</span>;
  const tone = ratio >= 1 ? 'up' : ratio >= 0.6 ? 'fair' : 'poor';
  return <span className={`ov-chip ov-chip--${tone}`}>{formatPercent(ratio)} des nötigen Tempos</span>;
}

// A share as a small pie, like the glyph of a share: the slice from twelve o'clock clockwise
function Pie({ share }) {
  const s = Math.min(1, Math.max(0, share));
  const angle = s * 2 * Math.PI;
  const [x, y] = [7 + 6 * Math.sin(angle), 7 - 6 * Math.cos(angle)];
  return (
    <svg className="ov-pie" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" />
      {s >= 0.999 ? (
        <circle cx="7" cy="7" r="6" className="ov-pie__slice" />
      ) : (
        s > 0.001 && <path className="ov-pie__slice" d={`M7 7 L7 1 A6 6 0 ${s > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} />
      )}
    </svg>
  );
}

// One number on its own card: what it is, the number large, one line of context
function Tile({ label, value, unit, sub, note }) {
  return (
    <div className="card ov-tile">
      <div className="ov-tile__label">
        {label}
        {note}
      </div>
      <div className="ov-tile__value tabular">
        {value}
        {unit && <span className="ov-tile__unit">{unit}</span>}
      </div>
      {sub && <div className="ov-tile__sub">{sub}</div>}
    </div>
  );
}

// A share or a target reached, as a bar: value 0..1 (beyond 1 full); mark: { at, label } – an earlier goal on the way
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

// A section of the page: a card with a head (title, lead, a chip on the right) and its exports in the foot
function Section({ title, lead, aside, csv, className = '', children }) {
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

/**
 * The page "Auf einen Blick" of a dashboard: one technology of the scope at a time – chosen in the band on top, the
 * URL's like on every page – on the whole page, the overview most visitors need: its numbers on cards of their own
 * (Bestand, Anlagen, Zubau of the running year, planned), its Arten (Solar: Gebäude, Balkonkraftwerke, Freifläche; Wind:
 * an Land, auf See; batteries: their size classes) with their shares and this year's Zubau, the Zubau per year, and in
 * Germany the national targets and the Länder in front. All power netto, the targets brutto (as the law counts).
 */
export default function OverviewView({ config, state }) {
  const { region, kreisAgs, kreisOptions, selectScope, scopeKey, scopeName, parentName } = state;
  const datenstand = useDatenstand();
  const technologies = config.technologies.filter((t) => t.statsPath && t.overview);
  // The URL's technology, or the first with an overview (Speicher: the batteries while the map shows Pumpspeicher)
  const technology = technologies.find((t) => t.id === state.technology.id) ?? technologies[0];
  const overview = technology.overview;
  const kind = kreisAgs ? 'kreis' : region ? 'land' : 'de';
  const level = kind === 'kreis' ? 'landkreis' : 'bundesland';
  const scope = { kind, key: scopeKey, name: scopeName, region, parentName };
  const kreisKeys = useMemo(() => (kreisOptions ? new Set(kreisOptions.map((k) => k.ags)) : null), [kreisOptions]);

  // The technology's data: its stats (Netto, the API's default), per Lage where its parts are Lagen, its source of the
  // parts per year, the planned units
  const stats = useStats(statsUrl(technology.statsPath, level));
  const lagen = overview.parts.filter((p) => p.lage).map((p) => p.lage);
  const lage0 = useStats(lagen[0] ? statsUrl(technology.statsPath, level, `lage=${lagen[0]}`) : null);
  const lage1 = useStats(lagen[1] ? statsUrl(technology.statsPath, level, `lage=${lagen[1]}`) : null);
  const ids = (list) => list.map((id) => `technology=${id}`).join('&');
  const arten = useJson(overview.source === 'solar' ? `${API_BASE_URL}/solar/arten?region=${scopeKey}` : null);
  const battery = useJson(overview.source === 'battery' ? `${API_BASE_URL}/battery/zubau?region=${scopeKey}` : null);
  const series = useJson(
    overview.source === 'series' ? `${API_BASE_URL}/zubau/zeitverlauf?region=${scopeKey}&yearly=true&${ids(overview.parts.map((p) => p.id))}` : null,
  );
  const geplant = useJson(overview.planned ? `${API_BASE_URL}/zubau/geplant?region=${scopeKey}&yearly=true&${ids(overview.planned)}` : null);
  const seriesByTechnology = useMemo(() => (series.data ? byTechnology(series.data) : null), [series.data]);
  const geplantByTechnology = useMemo(() => (geplant.data ? byTechnology(geplant.data) : null), [geplant.data]);

  const parts = useMemo(
    () =>
      partsOf({
        technology,
        scope,
        arten: arten.data,
        battery: battery.data,
        series: seriesByTechnology,
        lageStats: Object.fromEntries([lagen[0] && [lagen[0], lage0.data], lagen[1] && [lagen[1], lage1.data]].filter((e) => e && e[1])),
        stats: stats.data,
        kreisKeys,
      }),
    // scope is a new object every render: its key decides; lagen follow the technology
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [technology, scopeKey, kind, arten.data, battery.data, seriesByTechnology, lage0.data, lage1.data, stats.data, kreisKeys],
  );
  const model = useMemo(
    () =>
      stats.status === 'ready'
        ? pageModel({ technology, scope, stats: stats.data, parts, geplant: geplantByTechnology, datenstand, kreisKeys })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [technology, scopeKey, kind, stats.status, stats.data, parts, geplantByTechnology, datenstand, kreisKeys],
  );

  // The page's remarks, in the order the page marks them
  const isSolar = overview.source === 'solar';
  useFootnote('geplant', overview.planned ? PLANNED_NOTE : null);
  useFootnote('balkon', isSolar ? BALKON_NOTE : null);
  useFootnote('ziele', kind === 'de' && overview.targets ? TARGETS_NOTE : null);

  const head = (
    <header className="ov-head">
      <h2 className="ov-head__title">
        {technology.label} in {scopeName}
      </h2>
      <p className="ov-head__lead">
        Was in Betrieb ist, was {model?.zubau?.thisYear.year ?? 'dieses Jahr'} dazukam und was geplant ist
        {isSolar ? ' – Leistung netto, Ausbauziele brutto.' : '.'}
      </p>
    </header>
  );
  const band = <SelectionBar technologies={technologies} state={state} active={technology} filters={false} />;
  const scopeBar = <ScopeBar region={region} kreis={kreisAgs} kreisOptions={kreisOptions} onSelectScope={selectScope} />;

  if (stats.status !== 'ready' || !model) {
    return (
      <>
        {scopeBar}
        {band}
        {head}
        <ChartPlaceholder
          variant="bars"
          title={stats.status === 'error' ? 'Keine Daten' : stats.status === 'ready' ? 'Nichts in Betrieb' : 'Wird geladen …'}
          note={stats.status === 'ready' ? `${technology.label}: in ${scopeName} ist nichts in Betrieb.` : undefined}
        />
      </>
    );
  }

  const { measure, bestand, zubau, targets, leaders, planned } = model;
  const format = formatOf(measure.format);
  const [one, many] = overview.units ?? ['Anlage', 'Anlagen'];
  const noun = (n) => (n === 1 ? one : many);
  const fileBase = `mastr_${config.id}_${technology.id}_ueberblick`;
  const value = format(bestand.value);
  const shown = parts?.parts.filter((p) => p.units > 0 || p.value > 0) ?? [];
  const partsTotal = { units: shown.reduce((t, p) => t + p.units, 0), value: shown.reduce((t, p) => t + p.value, 0) };
  const year = zubau?.thisYear.year;
  const measureName = measure.label.replace('Installierte ', '');

  // The numbers, each on its card
  const tiles = [
    {
      id: 'bestand',
      label: measure.label,
      ...value,
      sub: [isSolar && 'netto', bestand.share != null && `${percent(bestand.share)} von ${kind === 'kreis' ? parentName : 'Deutschland'}`]
        .filter(Boolean)
        .join(' · '),
    },
    bestand.also && { id: 'also', label: bestand.also.label, ...formatOf(bestand.also.format)(bestand.also.value) },
    {
      id: 'units',
      label: `${many} in Betrieb`,
      value: formatCount(bestand.units),
      sub: bestand.rank ? `Rang ${bestand.rank.rank} von ${bestand.rank.of} nach ${measureName}` : null,
    },
    zubau && {
      id: 'zubau',
      label: `Zubau ${year}`,
      ...format(zubau.thisYear.value),
      value: `+${format(zubau.thisYear.value).value}`,
      sub: `${formatCount(zubau.thisYear.units)} ${noun(zubau.thisYear.units)} seit Januar`,
    },
    planned && {
      id: 'planned',
      label: 'In Planung',
      note: <FootnoteRef id="geplant" />,
      ...format(planned.value),
      sub: planned.units ? `${formatCount(planned.units)} ${noun(planned.units)}${planned.to ? ` · bis ${planned.to}` : ''}` : 'keine im Register',
    },
  ].filter(Boolean);

  const unit = measure.format === 'capacity' ? 'MWh' : 'MW';
  const partsCsv = {
    name: 'ueberblick-arten',
    filename: fileName(fileBase, 'arten', scopeKey),
    rows: () =>
      shown.map((p) => ({
        Gebiet: scopeName,
        Art: p.label,
        [`${many} in Betrieb`]: p.units,
        [`${measure.label} (${unit})`]: round(p.value, 3),
        [`Anteil an ${many} (%)`]: round((p.units / partsTotal.units) * 100, 2),
        [`Anteil an ${measureName} (%)`]: round((p.value / partsTotal.value) * 100, 2),
        [`Zubau ${year}: ${many}`]: p.years.get(year)?.addedUnits ?? 0,
        [`Zubau ${year} (${unit})`]: round(p.years.get(year)?.added ?? 0, 3),
      })),
  };
  const chartSeries = parts?.parts.map((p) => ({ id: p.id, label: p.label, color: p.color })) ?? [];
  const periods =
    zubau?.years.map((y) => ({
      key: String(y.year),
      label: y.running ? `${y.year} (bis heute)` : String(y.year),
      tick: String(y.year),
      partial: y.running,
      values: y.values,
    })) ?? [];

  return (
    <>
      {scopeBar}
      {band}
      {head}

      <div className="ov-tiles">
        {tiles.map(({ id, ...tile }) => (
          <Tile key={id} {...tile} />
        ))}
      </div>

      {/* The Arten, one card each: its units and its measure, its share of both, this year's Zubau */}
      {shown.length > 1 && (
        <Section
          title={overview.title}
          lead={`${scopeName} · Anteile am Bestand, Zubau seit Januar ${year}`}
          csv={partsCsv}
          className="ov-parts"
        >
          <ul className="ov-parts__list">
            {shown.map((p) => {
              const added = p.years.get(year) ?? { added: 0, addedUnits: 0 };
              return (
                <li key={p.id} className="ov-part" style={{ '--part-color': p.color }}>
                  <div className="ov-part__name">
                    <strong>
                      {p.label}
                      {p.id === 'balkon' && <FootnoteRef id="balkon" />}
                    </strong>
                    {p.hint && <span>{p.hint}</span>}
                  </div>
                  <div className="ov-part__metric">
                    <div className="ov-part__value tabular">
                      {formatCount(p.units)} <span>{noun(p.units)}</span>
                    </div>
                    <div className="ov-part__chips">
                      <span className="ov-chip ov-chip--flat">
                        <Pie share={p.units / partsTotal.units} /> {percent(p.units / partsTotal.units)} aller {many}
                      </span>
                      <span className="ov-chip ov-chip--up">
                        <TrendingUp size={13} aria-hidden="true" /> +{formatCount(added.addedUnits)} in {year}
                      </span>
                    </div>
                  </div>
                  <div className="ov-part__metric">
                    <div className="ov-part__value tabular">
                      {format(p.value).value} <span>{format(p.value).unit}</span>
                    </div>
                    <div className="ov-part__chips">
                      <span className="ov-chip ov-chip--flat">
                        <Pie share={p.value / partsTotal.value} /> {percent(p.value / partsTotal.value)} der {measureName}
                      </span>
                      <span className="ov-chip ov-chip--up">
                        <TrendingUp size={13} aria-hidden="true" /> +{joined(format(added.added))} in {year}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <div className={`ov-row${kind === 'de' && (targets || leaders) ? ' ov-row--aside' : ''}`}>
        {zubau && (
          <Section
            title="Zubau je Jahr"
            lead={`${scopeName} · neu in Betrieb, je Jahr${zubau.running ? `, ${zubau.latest} bis heute (hell)` : ''}`}
            aside={
              <span className="ov-change">
                {zubau.minor ? (
                  <span className="ov-chip ov-chip--flat">kaum Zubau</span>
                ) : (
                  <>
                    <ChangeChip change={zubau.change} />
                    {zubau.change != null && (
                      <span>
                        {zubau.full} ggü. {zubau.full - 1}
                      </span>
                    )}
                  </>
                )}
              </span>
            }
            csv={{
              name: 'ueberblick-zubau',
              filename: fileName(fileBase, 'zubau', scopeKey),
              rows: () =>
                zubau.years.map((y) => ({
                  Jahr: y.year,
                  ...Object.fromEntries(chartSeries.map((s) => [`${s.label} (${unit})`, round(y.values[s.id], 3)])),
                })),
            }}
          >
            <StackedChart periods={periods} series={chartSeries} kind="bars" unit={unit} label={`Zubau je Jahr in ${scopeName}`} />
            {chartSeries.length > 1 && (
              <ul className="ov-legend" aria-label="Farben">
                {chartSeries.map((s) => (
                  <li key={s.id}>
                    <i style={{ background: s.color }} aria-hidden="true" />
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            <p className="ov-note">
              <strong className="tabular">{joined(format(zubau.last))}</strong> im Jahr {zubau.full}. Die letzten Monate steigen noch: viele
              Anlagen werden erst Wochen nach der Inbetriebnahme registriert. <Link to={state.hrefOf('zubau')}>Mehr zum Zubau</Link>
            </p>
          </Section>
        )}

        {kind === 'de' && (targets || leaders) && (
          <div className="ov-aside">
            {targets && (
              <Section
                title={
                  <>
                    Ausbauziel {targets[0].goal.year}
                    <FootnoteRef id="ziele" />
                  </>
                }
                csv={{
                  name: 'ueberblick-ziele',
                  filename: fileName(fileBase, 'ausbauziele'),
                  rows: () =>
                    targets.map((t) => ({
                      Ziel: t.label,
                      Quelle: t.source,
                      'Bestand brutto (MW)': round(t.installed, 1),
                      [`Ziel ${t.goal.year} (MW)`]: t.goal.value,
                      'Erreicht (%)': round((t.installed / t.goal.value) * 100, 1),
                      [`Zubau ${t.pace.year} brutto (MW)`]: round(t.pace.actual, 1),
                      'Nötiger Zubau je Jahr (MW)': round(t.pace.needed, 1),
                    })),
                }}
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
            )}
            {leaders && (
              <Section
                title="Die Länder vorn"
                lead={`Anteil an der ${measureName} in Deutschland`}
                csv={{
                  name: 'ueberblick-laender',
                  filename: fileName(fileBase, 'laender'),
                  rows: () =>
                    leaders.map((l, i) => ({ Platz: i + 1, Gebiet: l.name, [`${measure.label} (${unit})`]: round(l.value, 1), 'Anteil (%)': round(l.share * 100, 1) })),
                }}
              >
                <ol className="ov-leaders">
                  {leaders.map((l, i) => (
                    <li key={l.name}>
                      <span className="ov-leaders__rank tabular">{i + 1}</span>
                      <span className="ov-leaders__name">{l.name}</span>
                      <span className="ov-leaders__bar" aria-hidden="true">
                        <i style={{ width: `${(l.share / leaders[0].share) * 100}%` }} />
                      </span>
                      <b className="tabular">{formatPercent(l.share)}</b>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
