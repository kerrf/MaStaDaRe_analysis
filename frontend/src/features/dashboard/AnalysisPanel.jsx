// One analysis in the Analysen section: a card that starts with a clear head (icon, title, what it shows, its actions on
// the right: tools), so the analyses read as separate pieces one below the other; below the head, its settings in a band
// (settings: SettingsRow, like the map's). id: the anchor the section's navigation jumps to.
export default function AnalysisPanel({ id, icon: Icon, title, lead, tools, settings, className = '', bodyId, bodyRole, children }) {
  return (
    <article id={id} className={`card analysis ${className}`} aria-labelledby={`${id}-title`}>
      <header className="analysis__head">
        <span className="analysis__icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="analysis__heading">
          <h3 id={`${id}-title`} className="analysis__title">
            {title}
          </h3>
          {lead && <p className="analysis__lead">{lead}</p>}
        </div>
        {tools && <div className="analysis__tools">{tools}</div>}
      </header>
      {settings && <div className="settings-band analysis__settings">{settings}</div>}
      <div className="analysis__body" id={bodyId} role={bodyRole}>
        {children}
      </div>
    </article>
  );
}
