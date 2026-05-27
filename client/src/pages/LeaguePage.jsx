import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import Layout from '../components/Layout';
import MatchCard from '../components/MatchCard';

const GROUPS = 'ABCDEFGHIJKL'.split('');
const STAGES = [
  { id: 'group', label: 'Group stage' },
  { id: 'round_of_32', label: 'Round of 32' },
  { id: 'round_of_16', label: 'Round of 16' },
  { id: 'quarter_final', label: 'Quarter-finals' },
  { id: 'semi_final', label: 'Semi-finals' },
  { id: 'third_place', label: '3rd place' },
  { id: 'final', label: 'Final' },
];

export default function LeaguePage({ user, onLogout }) {
  const { id } = useParams();
  const [tab, setTab] = useState('predictions');
  const [stageFilter, setStageFilter] = useState('group');
  const [groupFilter, setGroupFilter] = useState('A');
  const [matches, setMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leagueInfo, setLeagueInfo] = useState(null);
  const [error, setError] = useState('');

  const loadMatches = () => {
    const params =
      stageFilter === 'group'
        ? { stage: 'group', group: groupFilter }
        : { stage: stageFilter };
    api
      .matches(params)
      .then((d) => setMatches(d.matches))
      .catch((e) => setError(e.message));
  };

  const loadLeaderboard = () => {
    api
      .leaderboard(id)
      .then((d) => setLeaderboard(d.leaderboard))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    api.leagues().then((d) => {
      const league = d.leagues.find((l) => String(l.id) === id);
      setLeagueInfo(league);
    });
  }, [id]);

  useEffect(() => {
    if (tab === 'predictions') loadMatches();
    else loadLeaderboard();
  }, [tab, stageFilter, groupFilter, id]);

  const refresh = () => {
    if (tab === 'predictions') loadMatches();
    else loadLeaderboard();
  };

  const isOwner = leagueInfo?.is_owner;

  return (
    <Layout user={user} onLogout={onLogout}>
      <Link to="/" style={{ fontSize: '0.875rem', display: 'inline-block', marginBottom: '1rem' }}>
        ← Back to leagues
      </Link>

      {leagueInfo && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem' }}>{leagueInfo.name}</h2>
          <p style={{ marginTop: '0.5rem' }}>
            Invite code: <span className="league-code">{leagueInfo.code}</span>
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Share this code so friends can join your private league.
          </p>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'predictions' ? 'active' : ''}`}
          onClick={() => setTab('predictions')}
        >
          Predictions
        </button>
        <button
          type="button"
          className={`tab ${tab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setTab('leaderboard')}
        >
          Leaderboard
        </button>
      </div>

      {tab === 'predictions' && (
        <>
          <div className="tabs" style={{ marginBottom: '0.75rem' }}>
            {STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`tab ${stageFilter === s.id ? 'active' : ''}`}
                onClick={() => setStageFilter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {stageFilter === 'group' && (
            <div className="tabs" style={{ marginBottom: '1rem' }}>
              {GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`tab ${groupFilter === g ? 'active' : ''}`}
                  onClick={() => setGroupFilter(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
          <div className="match-list">
            {matches.length === 0 ? (
              <div className="empty-state card">No matches in this filter.</div>
            ) : (
              matches.map((m) => (
                <MatchCard key={m.id} match={m} onSaved={refresh} canSetResult={isOwner} />
              ))
            )}
          </div>
          {isOwner && (
            <p className="scoring-hint" style={{ marginTop: '1rem' }}>
              As league host, you can enter actual results after kickoff to update the leaderboard.
            </p>
          )}
        </>
      )}

      {tab === 'leaderboard' && (
        <div className="card">
          {leaderboard.length === 0 ? (
            <p className="empty-state">No scores yet — enter match results to rank players.</p>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Pts</th>
                  <th>Exact</th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={row.userId}>
                    <td className="rank">{i + 1}</td>
                    <td>
                      {row.name}
                      {row.userId === user.id ? ' (you)' : ''}
                    </td>
                    <td>{row.points}</td>
                    <td>{row.exactScores}</td>
                    <td>{row.correctResults}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="scoring-hint">
            3 points for exact score, 1 point for correct winner/draw. Knockout rounds count double.
            Predictions lock at kickoff.
          </p>
        </div>
      )}
    </Layout>
  );
}
