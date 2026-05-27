import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export default function LeagueSettingsPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  const load = () => api.league(id).then(setData);

  useEffect(() => {
    load();
  }, [id]);

  if (!data) return <div className="settings-page">Загрузка…</div>;

  const { league, members } = data;
  const isOwner = league.is_owner;

  const saveName = async () => {
    await api.updateLeague(id, name);
    setEditing(false);
    load();
  };

  const copyCode = () => {
    navigator.clipboard.writeText(league.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSuspend = async (userId) => {
    await api.suspendMember(id, userId);
    load();
  };

  const deleteLeague = async () => {
    if (!confirm('Удалить лигу? Это нельзя отменить.')) return;
    await api.deleteLeague(id);
    navigate('/');
  };

  return (
    <div className="app-root">
      <div
        className="app-header"
        style={{ background: 'var(--navy)', padding: '1rem' }}
      >
        <button
          type="button"
          className="nav-link"
          onClick={() => navigate(`/league/${id}`)}
          style={{ marginBottom: '0.5rem' }}
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: '1.1rem' }}>Настройки лиги</h1>
      </div>

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
              {isOwner && (
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
              )}
            </>
          )}
        </div>

        <button type="button" className="btn-invite" onClick={copyCode}>
          👥 {copied ? 'Код скопирован!' : 'Пригласи друзей в лигу!'}
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>({league.code})</span>
        </button>

        <div className="members-title">Участники: {members.length}</div>
        {members.map((m) => (
          <div key={m.id} className="member-row">
            <span>
              {m.name}
              {m.is_you ? ' (Ты)' : ''}
              {m.suspended ? ' — отстранён' : ''}
            </span>
            {isOwner && !m.is_you && (
              <button type="button" className="member-action" onClick={() => toggleSuspend(m.id)}>
                {m.suspended ? 'Вернуть' : 'Отстранить'}
              </button>
            )}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="delete-league-bar">
          <button type="button" className="delete-league-btn" onClick={deleteLeague}>
            🗑 Удалить лигу
          </button>
        </div>
      )}
    </div>
  );
}
