import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Chapters from '../features/home/Chapters';
import GermanyPreview from '../features/home/GermanyPreview';
import RegisterFigures from '../features/home/RegisterFigures';
import TargetsOverview from '../features/home/TargetsOverview';
import { SITE } from '../config/site';
import { useDatenstand } from '../lib/data';
import { formatDate } from '../lib/format';
import useDocumentTitle from '../lib/useDocumentTitle';
import './HomePage.css';

export default function HomePage() {
  useDocumentTitle(null);
  const datenstand = useDatenstand();

  return (
    <div className="home">
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__text">
            <Badge tone="brand">Datenstand {formatDate(datenstand)}</Badge>
            <h1 className="home-hero__title">
              Unsere Energiewende <span className="home-hero__highlight">im Blick</span>
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

      <section className="container home-section" aria-labelledby="register-title">
        <div className="home-intro">
          <span className="eyebrow">Stand {formatDate(datenstand)} · in Betrieb</span>
          <h2 id="register-title" className="home-intro__title">
            Was heute im Register steht
          </h2>
        </div>
        <RegisterFigures />
      </section>

      <section className="container home-section" aria-labelledby="ziele-title">
        <div className="home-intro">
          <span className="eyebrow">Ausbauziele des Bundes</span>
          <h2 id="ziele-title" className="home-intro__title">
            Auf dem Weg zu den Zielen 2030
          </h2>
        </div>
        <TargetsOverview />
      </section>

      <section className="container home-section" aria-labelledby="dashboards-title">
        <div className="home-intro">
          <span className="eyebrow">Drei Dashboards</span>
          <h2 id="dashboards-title" className="home-intro__title">
            Wo, wie viel und wie schnell
          </h2>
        </div>
        <Chapters />
        <p className="chapters__next">
          Als Nächstes: <Link to="/maerkte/strom">Märkte</Link> – Strom-, Gas- und CO₂-Preise als wirtschaftlicher Kontext.
        </p>
      </section>

      <section className="container home-section" aria-labelledby="quelle-title">
        <div className="sources">
          <h2 id="quelle-title" className="sources__title">
            So entstehen die Zahlen
          </h2>
          <dl className="sources__list">
            <div>
              <dt>Quelle</dt>
              <dd>
                Das Marktstammdatenregister der Bundesnetzagentur: Wer Strom oder Gas erzeugt oder speichert, muss seine Anlage dort
                eintragen – vom Balkonkraftwerk bis zum Gasspeicher.
              </dd>
            </div>
            <div>
              <dt>Aktualität</dt>
              <dd>
                Jede Nacht holt ein Abgleich alle geänderten Einheiten über die Webdienste des Registers. Aktueller Datenstand:{' '}
                {formatDate(datenstand)}.
              </dd>
            </div>
            <div>
              <dt>Aufbereitung</dt>
              <dd>
                Jede Einheit wird ihrer Gemeinde zugeordnet, zu Kreisen und Ländern summiert und je Fläche und Einwohner verglichen –
                nachvollziehbar dokumentiert.
              </dd>
            </div>
          </dl>
          <Link to="/info#methodik" className="home-link">
            Methodik im Detail <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
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
