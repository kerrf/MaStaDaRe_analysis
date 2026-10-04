import { Link } from 'react-router-dom';
import TodoNote from '../components/ui/TodoNote';
import { SITE } from '../config/site';
import { EVENTS_ENABLED } from '../lib/usage';
import useDocumentTitle from '../lib/useDocumentTitle';
import './pages.css';

export default function DatenschutzPage() {
  useDocumentTitle('Datenschutz');

  return (
    <div className="page">
      <header className="page-header">
        <div className="container page-header__inner">
          <span className="eyebrow">Rechtliches</span>
          <h1 className="page-header__title">Datenschutzerklärung</h1>
          <p className="page-header__lead">Welche Daten beim Besuch dieser Seite anfallen – kurz und transparent.</p>
        </div>
      </header>

      <div className="container page-body">
        <article className="prose legal">
          <TodoNote>
            Entwurf auf Basis der aktuellen Infrastruktur (Vercel, netcup, Cloudflare, Vercel Web Analytics). Vor der Veröffentlichung
            vollständig prüfen oder mit einem Datenschutz-Generator erstellen lassen. Dies ist keine Rechtsberatung.
          </TodoNote>

          <h2>1. Verantwortlicher</h2>
          <p>
            Verantwortlich im Sinne der DSGVO ist die im <Link to="/impressum">Impressum</Link> genannte Person
            {SITE.owner.email ? ` (${SITE.owner.email})` : ''}.
          </p>

          <h2>2. Hosting der Webseite</h2>
          <p>
            Die Webseite wird bei <strong>Vercel Inc.</strong> (USA) gehostet. Beim Aufruf verarbeitet Vercel technisch notwendige Daten wie
            IP-Adresse, Datum und Uhrzeit, aufgerufene Seite und Browserinformationen, um die Seite auszuliefern und vor Angriffen zu schützen
            (Art. 6 Abs. 1 lit. f DSGVO). In der Firewall-Übersicht von Vercel kann der Betreiber diese Verbindungsdaten der letzten
            24 Stunden einsehen.
          </p>

          <h2>3. Datenschnittstelle (API)</h2>
          <p>
            Die Kartendaten werden von einem Server bei der <strong>netcup GmbH</strong> (Deutschland) geladen. Der Datenverkehr läuft über{' '}
            <strong>Cloudflare, Inc.</strong> (USA), das als Reverse Proxy Schutz vor Angriffen und eine verschlüsselte Verbindung
            bereitstellt. Dabei werden technisch notwendige Verbindungsdaten verarbeitet.
          </p>
          <p>
            Der Server führt ein Zugriffsprotokoll: Für jede Anfrage an die Datenschnittstelle werden die IP-Adresse, Datum und Uhrzeit, die
            abgerufene Adresse, Statuscode und Datenmenge, Browser und Betriebssystem (User-Agent), die verweisende Seite und das von
            Cloudflare ermittelte Land gespeichert. Zweck sind der sichere Betrieb, die Analyse von Fehlern, die Abwehr von Missbrauch und
            eine statistische Auswertung der Nutzung (Art. 6 Abs. 1 lit. f DSGVO). Die Protokolle werden nach 7 Tagen gelöscht.
          </p>

          <h2>4. Reichweitenmessung und Ladezeiten</h2>
          <p>
            Zur Reichweitenmessung werden <strong>Vercel Web Analytics</strong> und <strong>Vercel Speed Insights</strong> eingesetzt. Beide
            setzen keine Cookies, speichern keine IP-Adressen und bilden keine Profile: Besucher werden über einen Hash aus der Anfrage
            gezählt, der nach einem Tag verfällt, sodass sie weder über mehrere Tage noch über andere Webseiten hinweg wiedererkannt werden.
            Erfasst werden die aufgerufene Seite, die verweisende Seite, Land, Browser, Betriebssystem und Gerätetyp, bei Speed Insights
            zusätzlich Messwerte zur Ladezeit der Seite
            {EVENTS_ENABLED ? ', außerdem die Nutzung einzelner Funktionen wie Kartenexporte oder die Wahl der Technologie' : ''} (Art. 6 Abs. 1
            lit. f DSGVO).
          </p>

          <h2>5. Schriftarten und Karten</h2>
          <p>
            Schriftarten werden lokal von dieser Webseite geladen; es besteht keine Verbindung zu Servern von Google. Die Karten der
            Dashboards werden ohne externe Kartendienste dargestellt.
          </p>
          <p>
            Nur die Seite <strong>Landkreis/Gemeinde</strong> zeigt eine Hintergrundkarte aus Kartenkacheln: die Karten Grau und Farbig
            vom <strong>Bundesamt für Kartographie und Geodäsie</strong> (basemap.de, Deutschland), das Satellitenbild von der{' '}
            <strong>EOX IT Services GmbH</strong> (Österreich). Beim Laden der Kacheln erhält der jeweilige Anbieter technisch bedingt
            die IP-Adresse, Datum und Uhrzeit sowie Browserinformationen; Kacheln des Satellitenbilds werden erst geladen, wenn es
            gewählt wird (Art. 6 Abs. 1 lit. f DSGVO, Interesse an einer aussagekräftigen Karte).
          </p>

          <h2>6. Ihre Rechte</h2>
          <p>
            Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch
            sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde.
          </p>
        </article>
      </div>
    </div>
  );
}
