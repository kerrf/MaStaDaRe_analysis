import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import useDocumentTitle from '../lib/useDocumentTitle';
import './pages.css';

export default function NotFoundPage() {
  useDocumentTitle('Seite nicht gefunden');
  return (
    <div className="container not-found">
      <span className="not-found__icon" aria-hidden="true">
        <MapPin size={26} />
      </span>
      <span className="eyebrow">Fehler 404</span>
      <h1 className="not-found__title">Diese Seite liegt außerhalb der Karte.</h1>
      <p className="not-found__text">Der Link ist vielleicht veraltet. Von hier aus geht es weiter:</p>
      <div className="not-found__actions">
        <Link to="/" className="btn btn--primary">
          Zur Übersicht
        </Link>
        <Link to="/erzeuger" className="btn btn--secondary">
          Erzeuger-Karte
        </Link>
      </div>
    </div>
  );
}
