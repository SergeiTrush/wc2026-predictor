import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import ModalOverlay from '../components/ModalOverlay';
import { redirectIfLeagueForbidden } from '../leagueAccess';

export default function LeagueSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError('');
    const leagueRes = await api.league(id);
    if (!leagueRes.league?.is_owner) {
      const err = new Error('Только владелец лиги может изменять настройки');
      err.status = 403;
      throw err;
    }
    if (leagueRes.members) {
      return { league: leagueRes.league, members: leagueRes.members };
    }
    return api.leagueSettings(id);
  };

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => {
        if (e?.status === 403) {
          navigate(`/league/${id}`, { replace: true });
          return;
        }
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setError(e.message || 'Не удалось загрузить настройки');
      });
  }, [id, navigate]);

  if (error) {
    return (
      <p className="error-banner league-settings-error">{error}</p>
    );
  }

  if (!data) {
    return (
      <div className="league-page-loading" aria-busy="true" aria-live="polite">
        <p>Загрузка…</p>
      </div>
    );
  }

  const { league, members } = data;

  const saveName = async () => {
    await api.updateLeague(id, name);
    setEditing(false);
    load().then(setData).catch((e) => setError(e.message));
  };

  const copyCode = () => {
    navigator.clipboard.writeText(league.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSuspend = async (userId) => {
    await api.suspendMember(id, userId);
    load().then(setData).catch((e) => setError(e.message));
  };

  const deleteLeague = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.deleteLeague(id);
      navigate('/');
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <>
    <div className="settings-page">
        <div className="settings-label">Название лиги</div>
        <div className="settings-name-row">
          {editing ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              autoFocus
              style={{
                fontSize: '1.25rem',
                background: 'transparent',
                border: 'none',
                color: '#fff',
                width: '100%',
              }}
            />
          ) : (
            <>
              <span className="settings-name">{league.name}</span>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--yellow)', cursor: 'pointer' }}
                onClick={() => {
                  setName(league.name);
                  setEditing(true);
                }}
              >
                ✎
              </button>
            </>
          )}
        </div>

        <button type="button" className="btn-invite" onClick={copyCode}>
          👥 {copied ? 'Код скопирован!' : 'Пригласи друзей в лигу!'}
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>({league.code})</span>
        </button>

        <div className="members-title">Участники: {members.length}</div>
        {members.map((m) => (
          <div key={m.id} className={`member-row ${m.is_owner ? 'member-row-owner' : ''}`}>
            <span className="member-name-cell">
              {m.name}
              {m.is_owner && <span className="owner-badge">Владелец</span>}
              {m.is_you && !m.is_owner && <span className="you-badge">Вы</span>}
              {m.suspended ? <span className="suspended-badge">Отстранён</span> : ''}
            </span>
            {!m.is_you && !m.is_owner && (
              <button type="button" className="member-action" onClick={() => toggleSuspend(m.id)}>
                {m.suspended ? 'Вернуть' : 'Отстранить'}
              </button>
            )}
          </div>
        ))}
    </div>

    <div className="delete-league-bar">
      <button type="button" className="delete-league-btn" onClick={() => setShowDeleteConfirm(true)}>
        🗑 Удалить лигу
      </button>
    </div>

    {showDeleteConfirm && data && (
        <ModalOverlay
          onClick={() => {
            if (!deleting) setShowDeleteConfirm(false);
          }}
        >
          <div className="modal-sheet confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-sheet-title">Удалить лигу?</h3>
            <p className="confirm-sheet-text">
              Лига «{data.league.name}» и все прогнозы участников будут удалены. Это действие нельзя
              отменить.
            </p>
            <div className="confirm-sheet-actions">
              <button
                type="button"
                className="btn-primary btn-confirm-cancel"
                disabled={deleting}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn-primary btn-confirm-danger"
                disabled={deleting}
                onClick={deleteLeague}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
