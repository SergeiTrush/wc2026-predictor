import { NavLink, useNavigate } from 'react-router-dom';
import { IconBack } from './AuthExitButton';

function navClass({ isActive }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

export default function AppHeader({ active, leagueId, isOwner = false, fixed = false }) {
  const navigate = useNavigate();
  const base = leagueId ? `/league/${leagueId}` : null;

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
      </div>
      {base && (
        <nav className="header-nav" aria-label="Разделы лиги">
          <NavLink to={base} end className={navClass} aria-current={active === 'matches' ? 'page' : undefined}>
            Матчи
          </NavLink>
          <NavLink
            to={`${base}/table`}
            className={navClass}
            aria-current={active === 'table' ? 'page' : undefined}
          >
            Таблица
          </NavLink>
          <NavLink
            to={`${base}/admin/results`}
            className={navClass}
            aria-current={active === 'results' ? 'page' : undefined}
          >
            Ввод Результатов
          </NavLink>
          {isOwner && (
            <NavLink
              to={`${base}/settings`}
              className={navClass}
              aria-current={active === 'settings' ? 'page' : undefined}
            >
              Настройки лиги
            </NavLink>
          )}
        </nav>
      )}
    </header>
  );
}
