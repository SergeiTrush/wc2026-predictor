import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import AuthExitButton from '../components/AuthExitButton';

export default function DashboardPage({ user, onLogout }) {
  const [leagues, setLeagues] = useState([]);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const leagueAccessError = location.state?.leagueError;

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
      <div className="auth-page auth-page--dashboard">
        <div className="dashboard-top">
          <div className="dashboard-top-text">
            <h1>Привет, {user.name}!</h1>
            <p className="subtitle">Лига друзей · прогнозы на все матчи ЧМ 2026</p>
          </div>
          <AuthExitButton onClick={onLogout} label="Выйти" />
        </div>
        {(leagueAccessError || error) && (
          <div className="error-banner">{leagueAccessError || error}</div>
        )}

        <div className="dashboard-actions">
          <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
            Создать лигу
          </button>
          <button
            type="button"
            className="btn-primary btn-outline-yellow"
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
              <strong>
                {l.name}
                {l.is_owner && <span className="owner-badge">Владелец</span>}
              </strong>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
                {l.member_count} участников
                {l.owner_name && !l.is_owner && ` · владелец: ${l.owner_name}`}
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
