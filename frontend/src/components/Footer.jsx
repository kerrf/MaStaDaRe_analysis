import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Zap } from 'lucide-react';
import Badge from './ui/Badge';
import { SITE } from '../config/site';
import { formatDate } from '../lib/format';
import './Footer.css';

const COLUMNS = [
  {
    title: 'Dashboards',
    links: [
      { label: 'Erzeuger', to: '/erzeuger' },
      { label: 'Speicher', to: '/speicher' },
      { label: 'Märkte', to: '/maerkte/strom' },
    ],
  },
  {
    title: 'Projekt',
    links: [
      { label: 'Info & Methodik', to: '/info' },
      { label: 'Datenquellen', to: '/info#quellen' },
      { label: 'FAQ', to: '/info#faq' },
      { label: 'GitHub', href: SITE.links.github },
      { label: 'LinkedIn', href: SITE.links.linkedin },
    ],
  },
  {
    title: 'Rechtliches',
    links: [
      { label: 'Impressum', to: '/impressum' },
      { label: 'Datenschutz', to: '/datenschutz' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Link to="/" className="footer__logo">
            <span className="navbar__logo" aria-hidden="true">
              <Zap size={16} strokeWidth={2.25} />
            </span>
            {SITE.name}
          </Link>
          <p>Interaktive Analysen zum Ausbau erneuerbarer Energien in Deutschland – auf Basis des Marktstammdatenregisters.</p>
          <Badge icon={Clock}>Datenstand {formatDate(SITE.dataStand)}</Badge>
        </div>

        <nav className="footer__cols" aria-label="Fußzeile">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="footer__heading">{col.title}</h2>
              <ul>
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer">
                        {link.label} <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link to={link.to}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="container footer__bottom">
        <span>
          © {new Date().getFullYear()} {SITE.owner.name || SITE.name}
        </span>
        <span>
          Daten: Marktstammdatenregister der Bundesnetzagentur,{' '}
          <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener noreferrer">
            dl-de/by-2-0
          </a>
        </span>
      </div>
    </footer>
  );
}
