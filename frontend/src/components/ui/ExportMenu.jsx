import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileImage, FileText, FileJson, FileSpreadsheet } from 'lucide-react';

// The formats in two groups: the data of a chart, and the chart as a picture
const GROUPS = [
  {
    label: 'Rohdaten',
    items: [
      { id: 'csv', label: 'CSV', hint: 'Tabelle, z. B. für Excel', icon: FileSpreadsheet },
      { id: 'json', label: 'JSON', hint: 'für eigene Auswertungen', icon: FileJson },
    ],
  },
  {
    label: 'Bilder',
    items: [
      { id: 'png', label: 'PNG', hint: 'Bild der Grafik', icon: FileImage },
      { id: 'pdf', label: 'PDF', hint: 'A4-Seite mit Titel und Quelle', icon: FileText },
    ],
  },
];

/**
 * A download button (the pictogram of the exports) that opens a menu: Rohdaten – CSV, JSON – and Bilder – PNG, PDF.
 * onExport(format, element): runs the export, the button's wrapper as `element` (to find the chart around it); busy:
 * the format being exported; disabled: { format: true } for the ones not possible now; size: 'sm' in a chart's foot,
 * 'md' in a card's head.
 */
export default function ExportMenu({ onExport, busy = null, disabled = {}, size = 'sm', className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !wrapper.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = (format) => {
    setOpen(false);
    onExport(format, wrapper.current);
  };
  return (
    <span ref={wrapper} className={`export-menu export-menu--${size} chart-export ${className}`}>
      <button
        type="button"
        className="export-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Herunterladen: Rohdaten oder Bild"
        onClick={() => setOpen((v) => !v)}
      >
        <Download size={size === 'sm' ? 13 : 15} aria-hidden="true" />
        {busy ? 'Wird erstellt …' : 'Download'}
      </button>
      {open && (
        <div id={id} className="export-menu__list" role="menu">
          {GROUPS.map((group) => (
            <div key={group.label} className="export-menu__group" role="group" aria-label={group.label}>
              <div className="export-menu__label" aria-hidden="true">
                {group.label}
              </div>
              {group.items.map(({ id: format, label, hint, icon: Icon }) => (
                <button
                  key={format}
                  type="button"
                  role="menuitem"
                  className="export-menu__item"
                  disabled={Boolean(busy) || Boolean(disabled[format])}
                  onClick={() => choose(format)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="export-menu__name">{label}</span>
                  <span className="export-menu__hint">{hint}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
