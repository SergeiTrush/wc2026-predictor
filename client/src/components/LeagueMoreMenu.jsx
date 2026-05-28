import { useNavigate } from 'react-router-dom';
import { useLeagueOwner } from '../hooks/useLeagueOwner';

export { useLeagueOwner } from '../hooks/useLeagueOwner';

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  );
}

export function HeaderMenuButton({ leagueId, onOpen }) {
  const isOwner = useLeagueOwner(leagueId);
  if (!leagueId || !isOwner) return null;
  return (
    <button type="button" className="header-icon-btn" aria-label="Меню" onClick={onOpen}>
      <IconMenu />
    </button>
  );
}

export default function LeagueMoreMenu({ leagueId, open, onClose }) {
  const navigate = useNavigate();
  const isOwner = useLeagueOwner(leagueId);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Меню</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        {isOwner && (
          <button
            type="button"
            className="btn-primary btn-menu-owner"
            onClick={() => {
              navigate(`/league/${leagueId}/settings`);
              onClose();
            }}
          >
            Настройки лиги
          </button>
        )}
        {isOwner && (
          <button
            type="button"
            className="btn-primary btn-menu-owner"
            onClick={() => {
              navigate(`/league/${leagueId}/admin/results`);
              onClose();
            }}
          >
            Ввод результатов
          </button>
        )}
      </div>
    </div>
  );
}
