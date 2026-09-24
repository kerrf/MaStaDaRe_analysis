import TodoNote from '../components/ui/TodoNote';
import { SITE } from '../config/site';
import useDocumentTitle from '../lib/useDocumentTitle';
import './pages.css';

const orPlaceholder = (value, placeholder) => value || <span className="placeholder-text">{placeholder}</span>;

export default function ImpressumPage() {
  useDocumentTitle('Impressum');
  const { owner } = SITE;

  return (
    <div className="page">
      <header className="page-header">
        <div className="container page-header__inner">
          <span className="eyebrow">Rechtliches</span>
          <h1 className="page-header__title">Impressum</h1>
        </div>
      </header>

      <div className="container page-body">
        <article className="prose legal">
          <TodoNote>
            Pflichtangaben in <code>src/config/site.js</code> → <code>owner</code> eintragen. Ob und in welchem Umfang eine Impressumspflicht
            besteht (§ 5 DDG), hängt vom Charakter der Seite ab – im Zweifel rechtlich prüfen lassen. Dies ist keine Rechtsberatung.
          </TodoNote>

          <h2>Angaben gemäß § 5 DDG</h2>
          <p>
            {orPlaceholder(owner.name, 'Vorname Nachname')}
            <br />
            {orPlaceholder(owner.street, 'Straße Hausnummer')}
            <br />
            {orPlaceholder(owner.postalCity, 'PLZ Ort')}
          </p>

          <h2>Kontakt</h2>
          <p>E-Mail: {owner.email ? <a href={`mailto:${owner.email}`}>{owner.email}</a> : orPlaceholder('', 'name@beispiel.de')}</p>

          <h2>Hinweis</h2>
          <p>
            Dieses Dashboard ist ein privates, nicht-kommerzielles Projekt und kein offizielles Angebot der Bundesnetzagentur. Für Inhalte
            externer Links sind ausschließlich deren Betreiber verantwortlich.
          </p>
        </article>
      </div>
    </div>
  );
}
