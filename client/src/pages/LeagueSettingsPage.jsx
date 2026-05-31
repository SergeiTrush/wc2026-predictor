import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, setToken } from '../api';
import ModalOverlay from '../components/ModalOverlay';
import { redirectIfLeagueForbidden } from '../leagueAccess';

export default function LeagueSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [userNameError, setUserNameError] = useState('');
  const [leagueNameError, setLeagueNameError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [editingUserName, setEditingUserName] = useState(false);
  const [userName, setUserName] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const leagueRes = await api.league(id);
    const isOwner = !!leagueRes.league?.is_owner;

    if (isOwner) {
      if (leagueRes.members) {
        return { league: leagueRes.league, members: leagueRes.members, isOwner: true };
      }
      const settings = await api.leagueSettings(id);
      return { ...settings, isOwner: true };
    }

    const me = await api.me();
    return {
      league: leagueRes.league,
      members: [
        {
          id: me.user.id,
          name: me.user.name,
          is_you: true,
          is_owner: false,
          suspended: false,
        },
      ],
      isOwner: false,
    };
  };

  useEffect(() => {
    load()
      .then(setData)
      .catch((e) => {
        if (redirectIfLeagueForbidden(e, navigate)) return;
        setLoadError(e.message || 'Не удалось загрузить настройки');
      });
  }, [id, navigate]);

  if (loadError && !data) {
    return <p className="error-banner league-settings-error">{loadError}</p>;
  }

  if (!data) {
    return (
      <div className="league-page-loading" aria-busy="true" aria-live="polite">
        <p>Загрузка…</p>
      </div>
    );
  }

  const { league, members, isOwner } = data;
  const self = members.find((m) => m.is_you);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === league.name) {
      setEditing(false);
      setLeagueNameError('');
      return;
    }
    setLeagueNameError('');
    try {
      await api.updateLeague(id, trimmed);
      setEditing(false);
      load().then(setData).catch(() => {});
    } catch (e) {
      setLeagueNameError(e.message);
      setEditing(true);
    }
  };

  const saveUserName = async () => {
    const trimmed = userName.trim();
    if (!trimmed || trimmed === self?.name) {
      setEditingUserName(false);
      setUserNameError('');
      return;
    }
    setUserNameError('');
    try {
      const res = await api.updateProfile(trimmed);
      if (res.token) setToken(res.token);
      setEditingUserName(false);
      load().then(setData).catch(() => {});
    } catch (e) {
      setUserNameError(e.message);
      setEditingUserName(true);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(league.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSuspend = async (userId) => {
    await api.suspendMember(id, userId);
    load().then(setData).catch(() => {});
  };

  const deleteLeague = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteLeague(id);
      navigate('/');
    } catch (e) {
      setDeleteError(e.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="settings-page">
        {isOwner && (
          <>
            <div className="settings-label">Название лиги</div>
            <div className="settings-name-row">
              {editing ? (
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (leagueNameError) setLeagueNameError('');
                  }}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') {
                      setName(league.name);
                      setLeagueNameError('');
                      setEditing(false);
                    }
                  }}
                  autoFocus
                  className="settings-name-input"
                  aria-label="Название лиги"
                />
              ) : (
                <>
                  <span className="settings-name">{league.name}</span>
                  <button
                    type="button"
                    className="settings-edit-btn"
                    onClick={() => {
                      setName(league.name);
                      setLeagueNameError('');
                      setEditing(true);
                    }}
                    aria-label="Изменить название лиги"
                  >
                    ✎
                  </button>
                </>
              )}
            </div>
            {leagueNameError && (
              <p className="settings-field-error" role="alert">
                {leagueNameError}
              </p>
            )}
          </>
        )}

        <div className="settings-label">Ваше имя</div>
        <div className="settings-name-row">
          {editingUserName ? (
            <input
              value={userName}
              onChange={(e) => {
                setUserName(e.target.value);
                if (userNameError) setUserNameError('');
              }}
              onBlur={saveUserName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setUserName(self?.name || '');
                  setUserNameError('');
                  setEditingUserName(false);
                }
              }}
              autoFocus
              className="settings-name-input"
              aria-label="Ваше имя"
            />
          ) : (
            <>
              <span className="settings-name">{self?.name}</span>
              <button
                type="button"
                className="settings-edit-btn"
                onClick={() => {
                  setUserName(self?.name || '');
                  setUserNameError('');
                  setEditingUserName(true);
                }}
                aria-label="Изменить имя"
              >
                ✎
              </button>
            </>
          )}
        </div>
        {userNameError && (
          <p className="settings-field-error" role="alert">
            {userNameError}
          </p>
        )}

        {isOwner && (
          <>
            <button type="button" className="btn-invite" onClick={copyCode}>
              👥 {copied ? 'Код скопирован!' : 'Пригласи друзей в лигу!'}
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>({league.code})</span>
            </button>

            <div className="members-title">Участники: {members.length}</div>
            {members.map((m) => (
              <div key={m.id} className={`member-row ${m.is_owner ? 'member-row-owner' : ''}`}>
                <span className="member-name-cell">
                  {m.name}
                  {m.is_owner ? <span className="owner-badge">Владелец</span> : null}
                  {m.is_you && !m.is_owner ? <span className="you-badge">Вы</span> : null}
                  {m.suspended ? <span className="suspended-badge">Отстранён</span> : ''}
                </span>
                {!m.is_you && !m.is_owner && (
                  <button type="button" className="member-action" onClick={() => toggleSuspend(m.id)}>
                    {m.suspended ? 'Вернуть' : 'Отстранить'}
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {isOwner && (
        <div className="delete-league-bar">
          <button type="button" className="delete-league-btn" onClick={() => setShowDeleteConfirm(true)}>
            🗑 Удалить лигу
          </button>
        </div>
      )}

      {isOwner && showDeleteConfirm && data && (
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
            {deleteError && <p className="error-banner confirm-sheet-error">{deleteError}</p>}
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
