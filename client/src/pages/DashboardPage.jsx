import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Layout from '../components/Layout';

export default function DashboardPage({ user, onLogout }) {
  const [leagues, setLeagues] = useState([]);
  const [tournament, setTournament] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const load = () => {
    api.leagues().then((d) => setLeagues(d.leagues)).catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    api.tournament().then(setTournament).catch(() => {});
  }, []);

  const createLeague = async (e) => {
    e.preventDefault();
    try {
      await api.createLeague(leagueName);
      setLeagueName('');
      setShowCreate(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const joinLeague = async (e) => {
    e.preventDefault();
    try {
      await api.joinLeague(joinCode);
      setJoinCode('');
      setShowJoin(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Layout user={user} onLogout={onLogout}>
      {error && <div className="error-banner">{error}</div>}

      {tournament && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{tournament.name}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {tournament.total_matches} matches · {tournament.finished_matches} with results · Scoring:{' '}
            {tournament.scoring.exactScore} pts exact, {tournament.scoring.correctResult} pt result, ×
            {tournament.scoring.knockoutMultiplier} in knockouts
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          Create league
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowJoin(true)}>
          Join with code
        </button>
      </div>

      <h2 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
        Your leagues
      </h2>

      {leagues.length === 0 ? (
        <div className="card empty-state">
          <p>No leagues yet. Create one and share the invite code with friends.</p>
        </div>
      ) : (
        <div className="league-grid">
          {leagues.map((l) => (
            <Link key={l.id} to={`/league/${l.id}`} className="card league-card" style={{ color: 'inherit' }}>
              <div>
                <strong>{l.name}</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {l.member_count} player{l.member_count !== 1 ? 's' : ''}
                  {l.is_owner ? ' · You host' : ''}
                </p>
              </div>
              <span className="league-code">{l.code}</span>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create a league</h3>
            <form onSubmit={createLeague}>
              <div className="form-group">
                <label>League name</label>
                <input
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  placeholder="Office WC pool"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="modal-overlay" onClick={() => setShowJoin(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3>Join a league</h3>
            <form onSubmit={joinLeague}>
              <div className="form-group">
                <label>Invite code</label>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  required
                  maxLength={6}
                  style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowJoin(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
