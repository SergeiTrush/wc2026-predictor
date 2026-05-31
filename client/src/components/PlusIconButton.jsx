export default function PlusIconButton({
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
  className = '',
  interactive = true,
}) {
  const classes = `plus-icon-btn ${active ? 'plus-icon-btn--active' : ''} ${className}`.trim();
  const icon = (
    <svg className="plus-icon-btn__svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );

  if (!interactive) {
    return (
      <span className={classes} aria-hidden="true">
        {icon}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      {icon}
    </button>
  );
}
