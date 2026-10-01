// One analysis in the Analysen section: a card that starts with a clear head (icon, title, what it shows, its tools on the
// right), so the analyses read as separate pieces one below the other. id: the anchor the section's navigation jumps to.
export default function AnalysisPanel({ id, icon: Icon, title, lead, tools, className = '', bodyId, bodyRole, children }) {
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
      <div className="analysis__body" id={bodyId} role={bodyRole}>
        {children}
      </div>
    </article>
  );
}
