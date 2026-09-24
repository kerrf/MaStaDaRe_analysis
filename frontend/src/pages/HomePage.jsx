import { Link } from 'react-router-dom';
import { ArrowRight, BatteryCharging, Check, ChartLine, Database, Map as MapIcon, Sun, Workflow } from 'lucide-react';
import Badge from '../components/ui/Badge';
import GermanyPreview from '../features/home/GermanyPreview';
import KpiStrip from '../features/dashboard/KpiStrip';
import { ERZEUGER } from '../config/dashboards';
import { SITE } from '../config/site';
import { statsUrl, useStats } from '../lib/data';
import { formatDate } from '../lib/format';
import useDocumentTitle from '../lib/useDocumentTitle';
import './HomePage.css';

const TOPICS = [
  {
    id: 'erzeuger',
    to: '/erzeuger',
    icon: Sun,
    title: 'Erzeuger',
    status: 'live',
    text: 'Wo wird wie viel Strom erzeugt? Photovoltaik heute – Wind, Biomasse und Wasserkraft folgen.',
    points: ['Bundesland- und PLZ-Ebene', 'Absolut, je km² oder je Einwohner', 'Export als PNG, PDF und CSV'],
  },
  {
    id: 'speicher',
    to: '/speicher',
    icon: BatteryCharging,
    title: 'Speicher',
    status: 'soon',
    text: 'Batterie- und Pumpspeicher mit Kapazität und Leistung – vom Heimspeicher bis zum Großspeicher.',
    points: ['Kapazität (MWh) und Leistung (MW)', 'Größenklassen Heim, Gewerbe, Groß', 'Speicher je PV-Leistung'],
  },
  {
    id: 'maerkte',
    to: '/maerkte/strom',
    icon: ChartLine,
    title: 'Märkte',
    status: 'planned',
    text: 'Strom-, Gas- und CO₂-Preise – der wirtschaftliche Kontext zum Ausbau.',
    points: ['Day-Ahead-Strompreise', 'Gaspreise und Speicherfüllstände', 'CO₂-Zertifikatspreise'],
  },
];

const STATUS_BADGE = {
  live: <Badge tone="live">Live</Badge>,
  soon: <Badge tone="soon">In Vorbereitung</Badge>,
  planned: <Badge>Geplant</Badge>,
};

const STEPS = [
  {
    icon: Database,
    title: 'Rohdaten',
    text: 'Gesamtdatenexport des Marktstammdatenregisters der Bundesnetzagentur – Millionen registrierter Einheiten.',
  },
  {
    icon: Workflow,
    title: 'Aufbereitung',
    text: 'Bereinigung und Aggregation in PostgreSQL/PostGIS: nach Bundesland, PLZ-Region und Postleitzahl.',
  },
  {
    icon: MapIcon,
    title: 'Visualisierung',
    text: 'Interaktive Karten mit relativen Kennzahlen je Fläche und Einwohner – teil- und exportierbar.',
  },
];

export default function HomePage() {
  useDocumentTitle(null);
  const kpiStats = useStats(statsUrl(ERZEUGER.technologies[0].statsPath, 'Bundesland'));

  return (
    <div className="home">
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__text">
            <Badge tone="brand">Marktstammdatenregister · Datenstand {formatDate(SITE.dataStand)}</Badge>
            <h1 className="home-hero__title">
              Die Energiewende <span className="home-hero__highlight">im Blick</span>
            </h1>
            <p className="home-hero__lead">
              Interaktive Analysen und Visualisierungen zum Ausbau erneuerbarer Energien in Deutschland – basierend auf hochauflösenden
              Daten des Marktstammdatenregisters (MaStR).
            </p>
            <div className="home-hero__actions">
              <Link to="/erzeuger" className="btn btn--primary btn--lg">
                Karte öffnen <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/info" className="btn btn--secondary btn--lg">
                Methodik &amp; Quellen
              </Link>
            </div>
          </div>
          <GermanyPreview />
        </div>
      </section>

      <section className="container home-section" data-topic="erzeuger" aria-labelledby="zahlen-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">Photovoltaik</span>
            <h2 id="zahlen-title" className="section-head__title">
              Deutschland in Zahlen
            </h2>
          </div>
          <Link to="/erzeuger" className="home-link">
            Alle Kennzahlen <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <KpiStrip kpis={ERZEUGER.kpis} rows={kpiStats.data} status={kpiStats.status} region={null} />
      </section>

      <section className="container home-section" aria-labelledby="dashboards-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">Dashboards</span>
            <h2 id="dashboards-title" className="section-head__title">
              Drei Blickwinkel auf das Energiesystem
            </h2>
          </div>
        </div>
        <div className="topic-grid">
          {TOPICS.map(({ id, to, icon: Icon, title, status, text, points }) => (
            <Link key={id} to={to} className="topic-card card" data-topic={id}>
              <div className="topic-card__top">
                <span className="topic-card__icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                {STATUS_BADGE[status]}
              </div>
              <h3 className="topic-card__title">{title}</h3>
              <p className="topic-card__text">{text}</p>
              <ul className="topic-card__points">
                {points.map((p) => (
                  <li key={p}>
                    <Check size={14} aria-hidden="true" /> {p}
                  </li>
                ))}
              </ul>
              <span className="topic-card__cta">
                Öffnen <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container home-section" aria-labelledby="methodik-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">Methodik</span>
            <h2 id="methodik-title" className="section-head__title">
              Von Rohdaten zur Karte
            </h2>
            <p className="section-head__lead">
              Das Marktstammdatenregister ist öffentlich, aber schwer lesbar. Dieses Projekt macht die Daten regional vergleichbar.
            </p>
          </div>
          <Link to="/info#methodik" className="home-link">
            Mehr zur Methodik <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <ol className="steps">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="step card">
              <span className="step__index tabular">{String(i + 1).padStart(2, '0')}</span>
              <span className="step__icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <h3 className="step__title">{title}</h3>
              <p className="step__text">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container home-section">
        <div className="cta-band">
          <div>
            <h2 className="cta-band__title">Fragen, Feedback oder Datenwünsche?</h2>
            <p className="cta-band__text">Das Projekt ist offen und wächst weiter. Anregungen sind jederzeit willkommen.</p>
          </div>
          <div className="cta-band__actions">
            <Link to="/info#kontakt" className="btn btn--primary">
              Kontakt
            </Link>
            <a href={SITE.links.github} target="_blank" rel="noopener noreferrer" className="btn btn--secondary">
              GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
