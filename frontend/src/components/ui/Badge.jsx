export default function Badge({ tone = 'neutral', size, icon: Icon, children }) {
  const classes = ['badge', tone !== 'neutral' && `badge--${tone}`, size && `badge--${size}`].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}
