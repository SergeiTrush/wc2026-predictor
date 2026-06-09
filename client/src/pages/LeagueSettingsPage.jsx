import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api, isSessionExpiredError, setToken } from '../api';
import { redirectIfLeagueForbidden } from '../leagueAccess';
import { useConfirm } from '../context/ConfirmContext';

export default function LeagueSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { league: layoutLeague } = useOutletContext() || {};
  const { confirmAction } = useConfirm();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [userNameError, setUserNameError] = useState('');
  const [leagueNameError, setLeagueNameError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [editingUserName, setEditingUserName] = useState(false);
  const [userName, setUserName] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async (signal, cachedLeague) => {
    const leagueRes = cachedLeague
      ? { league: cachedLeague }
      : await api.league(id, signal);
    const isOwner = !!leagueRes.league?.is_owner;

    if (isOwner) {
      if (leagueRes.members) {
        return { league: leagueRes.league, members: leagueRes.members, isOwner: true };
      }
      const settings = await api.leagueSettings(id, signal);
      return { ...settings, isOwner: true };
    }

    const me = await api.me(signal);
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
    const controller = new AbortController();
    setData(null);
    setLoadError('');

    load(controller.signal, layoutLeague)
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload);
      })
      .catch((e) => {
        if (controller.signal.aborted || e.name === 'AbortError') return;
        if (redirectIfLeagueForbidden(e, navigate)) return;
        if (isSessionExpiredError(e)) return;
        setLoadError(e.message || 'Не удалось загрузить настройки');
      });

    return () => controller.abort();
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

  const promptDeleteLeague = () => {
    if (!data?.league) return;
    confirmAction({
      title: 'Удалить лигу?',
      message: `Лига «${data.league.name}» и все прогнозы участников будут удалены. Это действие нельзя отменить.`,
      confirmLabel: 'Удалить',
      danger: true,
      action: async () => {
        await api.deleteLeague(id);
        navigate('/');
      },
    });
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
          <button type="button" className="delete-league-btn" onClick={promptDeleteLeague}>
            🗑 Удалить лигу
          </button>
        </div>
      )}
    </>
  );
}
