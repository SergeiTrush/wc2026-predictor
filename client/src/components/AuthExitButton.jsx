export function IconBack() {
  return (
    <svg
      className="header-back-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 12H6" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function IconExit() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function AuthExitButton({ onClick, label = 'Выйти' }) {
  if (!onClick) return null;
  return (
    <button type="button" className="auth-exit-btn header-icon-btn" aria-label={label} onClick={onClick}>
      <IconExit />
    </button>
  );
}
