import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Badge from '../components/ui/Badge';
import useDocumentTitle from '../lib/useDocumentTitle';
import useRobots from '../lib/useRobots';
import './pages.css';

// How complete and plausible the register's entries are. The content follows; until then search engines leave the page
// out (noindex) and the sitemap doesn't list it (scripts/prerender.mjs).
export default function DatenqualitaetPage() {
  useDocumentTitle('Datenqualität des MaStR');
  useRobots('noindex');

  return (
    <div className="page" data-topic="qualitaet">
      <header className="page-header">
        <div className="container page-header__inner">
          <Link to="/" className="page-header__back">
            <ArrowLeft size={15} aria-hidden="true" /> Übersicht
          </Link>
          <div className="page-header__row">
            <div>
              <span className="eyebrow">Datenqualität</span>
              <h1 className="page-header__title">Datenqualität des MaStR</h1>
            </div>
            <Badge tone="soon">In Vorbereitung</Badge>
          </div>
          <p className="page-header__lead">
            Wie vollständig und plausibel sind die Angaben im Marktstammdatenregister? Diese Seite wird gerade aufgebaut.
          </p>
        </div>
      </header>
    </div>
  );
}
