import { useNavigate } from 'react-router-dom';
import { IconBack } from './AuthExitButton';
import { HeaderMenuButton } from './LeagueMoreMenu';

export default function AppHeader({ active, leagueId, onOpenMenu, isOwner, fixed = false }) {
  const navigate = useNavigate();

  return (
    <header className={`app-header${fixed ? ' app-header--fixed' : ''}`}>
      <div className="header-top">
        {leagueId && (
          <button
            type="button"
            className="header-icon-btn header-icon-btn--back"
            aria-label="Все лиги"
            onClick={() => navigate('/')}
          >
            <IconBack />
          </button>
        )}
        <div className="brand">
          <img src="/wc2026-logo.png" alt="FIFA World Cup 2026" className="brand-logo" />
          <div className="brand-title">
            WC 2026
            <br />
            MATCH PREDICTOR
          </div>
        </div>
        {leagueId && (
          <div className="header-actions">
            {onOpenMenu && <HeaderMenuButton leagueId={leagueId} onOpen={onOpenMenu} isOwner={isOwner} />}
          </div>
        )}
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
          className={`nav-link ${active === 'table' ? 'active' : ''}`}
          onClick={() => leagueId && navigate(`/league/${leagueId}/table`)}
        >
          Таблица
        </button>
      </nav>
    </header>
  );
}
