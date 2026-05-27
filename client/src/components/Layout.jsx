import { Link } from 'react-router-dom';

export default function Layout({ user, onLogout, children }) {
  return (
    <div className="app-shell">
      <header className="header">
        <Link to="/" className="logo" style={{ color: 'inherit' }}>
          <div className="logo-icon">⚽</div>
          <div>
            <h1>WC 2026 Predictor</h1>
            <p>Hi, {user.name}</p>
          </div>
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
          Log out
        </button>
      </header>
      {children}
    </div>
  );
}
