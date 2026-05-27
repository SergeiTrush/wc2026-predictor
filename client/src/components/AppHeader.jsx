import { useNavigate } from 'react-router-dom';

export default function AppHeader({ active, leagueId, onOpenMenu }) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand">
          <div className="brand-logo">🏆</div>
          <div className="brand-title">
            FIFA WORLD CUP
            <br />
            2026
          </div>
        </div>
        <button type="button" className="nav-link" onClick={onOpenMenu}>
          Ещё ▾
        </button>
      </div>
      <nav className="header-nav">
        <button
          type="button"
          className={`nav-link ${active === 'matches' ? 'active' : ''}`}
          onClick={() => leagueId && navigate(`/league/${leagueId}`)}
        >
          Матчи
        </button>
        <button
          type="button"
          className={`nav-link ${active === 'groups' ? 'active' : ''}`}
          onClick={() => leagueId && navigate(`/league/${leagueId}/groups`)}
        >
          Группы
        </button>
        <button
          type="button"
          className={`nav-link ${active === 'table' ? 'active' : ''}`}
          onClick={() => leagueId && navigate(`/league/${leagueId}/table`)}
        >
          Таблица
        </button>
      </nav>
    </header>
  );
}
