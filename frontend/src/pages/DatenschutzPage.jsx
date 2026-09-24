import { Link } from 'react-router-dom';
import TodoNote from '../components/ui/TodoNote';
import { SITE } from '../config/site';
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
            IP-Adresse, Datum und Uhrzeit, aufgerufene Seite und Browserinformationen, um die Seite auszuliefern (Art. 6 Abs. 1 lit. f DSGVO).
          </p>

          <h2>3. Datenschnittstelle (API)</h2>
          <p>
            Die Kartendaten werden von einem Server bei der <strong>netcup GmbH</strong> (Deutschland) geladen. Der Datenverkehr läuft über{' '}
            <strong>Cloudflare, Inc.</strong> (USA), das als Reverse Proxy Schutz vor Angriffen und eine verschlüsselte Verbindung
            bereitstellt. Dabei werden technisch notwendige Verbindungsdaten verarbeitet.
          </p>

          <h2>4. Reichweitenmessung</h2>
          <p>
            Zur anonymisierten Reichweitenmessung wird <strong>Vercel Web Analytics</strong> eingesetzt. Es werden keine Cookies gesetzt und
            keine personenbezogenen Profile gebildet.
          </p>

          <h2>5. Schriftarten und Karten</h2>
          <p>
            Schriftarten werden lokal von dieser Webseite geladen; es besteht keine Verbindung zu Servern von Google. Die Karten werden
            ohne externe Kartendienste (Kacheln) dargestellt.
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
