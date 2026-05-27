import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function DashboardPage({ user }) {
  const [leagues, setLeagues] = useState([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();

  const load = () => {
    api.leagues().then((d) => setLeagues(d.leagues)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const createLeague = async (e) => {
    e.preventDefault();
    try {
      const { league } = await api.createLeague(leagueName);
      setShowCreate(false);
      setLeagueName('');
      navigate(`/league/${league.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const joinLeague = async (e) => {
    e.preventDefault();
    try {
      const { league } = await api.joinLeague(joinCode);
      setShowJoin(false);
      navigate(`/league/${league.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-root">
      <div className="auth-page" style={{ minHeight: 'auto', padding: '1.5rem 1rem' }}>
        <h1 style={{ marginBottom: '0.25rem' }}>Привет, {user.name}!</h1>
        <p className="subtitle" style={{ marginBottom: '1rem' }}>
          Выбери лигу или создай новую
        </p>
        {error && <div className="error-banner">{error}</div>}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => setShowCreate(true)}>
            Создать лигу
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, background: 'transparent', border: '1px solid var(--yellow)', color: 'var(--yellow)' }}
            onClick={() => setShowJoin(true)}
          >
            Код лиги
          </button>
        </div>

        {leagues.map((l) => (
          <button
            key={l.id}
            type="button"
            className="league-list-card"
            style={{ width: '100%', cursor: 'pointer', border: 'none', textAlign: 'left', color: 'inherit' }}
            onClick={() => navigate(`/league/${l.id}`)}
          >
            <div>
              <strong>{l.name}</strong>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                {l.member_count} участников
              </p>
            </div>
            <span className="league-code">{l.code}</span>
          </button>
        ))}

        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: '1rem' }}>Новая лига</h3>
              <form onSubmit={createLeague}>
                <div className="form-group">
                  <label>Название</label>
                  <input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} required />
                </div>
                <button type="submit" className="btn-primary">
                  Создать
                </button>
              </form>
            </div>
          </div>
        )}

        {showJoin && (
          <div className="modal-overlay" onClick={() => setShowJoin(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: '1rem' }}>Войти в лигу</h3>
              <form onSubmit={joinLeague}>
                <div className="form-group">
                  <label>Код приглашения</label>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    required
                    maxLength={6}
                    style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
                  />
                </div>
                <button type="submit" className="btn-primary">
                  Войти
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
