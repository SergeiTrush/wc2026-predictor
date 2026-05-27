import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import MatchCard from '../components/MatchCard';
import ScoringModal from '../components/ScoringModal';

export default function LeaguePage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [matchdays, setMatchdays] = useState([]);
  const [matchday, setMatchday] = useState('');
  const [matches, setMatches] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScoring, setShowScoring] = useState(false);

  const loadMatches = () => {
    if (!matchday) return;
    api.matches({ matchday, leagueId: id }).then((d) => setMatches(d.matches));
  };

  useEffect(() => {
    api.league(id).then((d) => setLeague(d.league));
    api.matchdays().then((d) => {
      setMatchdays(d.matchdays);
      if (d.matchdays.length && !matchday) {
        const today = new Date().toISOString().slice(0, 10);
        const pick = d.matchdays.find((day) => day >= today) || d.matchdays[0];
        setMatchday(pick);
      }
    });
  }, [id]);

  useEffect(() => {
    loadMatches();
  }, [matchday, id]);

  const friendsActive = matches.reduce((n, m) => n + (m.friendsPredicted > 0 ? 1 : 0), 0);

  return (
    <div className="app-root">
      <AppHeader
        active="matches"
        leagueId={id}
        onOpenMenu={() => setMenuOpen(true)}
      />

      {friendsActive > 0 && (
        <div className="social-banner">
          Прогнозы друзей в лиге «{league?.name}» →
        </div>
      )}

      <div className="matchday-tabs">
        {matchdays.map((day) => (
          <button
            key={day}
            type="button"
            className={`matchday-tab ${matchday === day ? 'active' : ''}`}
            onClick={() => setMatchday(day)}
          >
            {new Date(day + 'T12:00:00').toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
            })}
          </button>
        ))}
      </div>

      <div className="page-content">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} leagueId={id} onSaved={loadMatches} />
        ))}
        {matches.length === 0 && matchday && (
          <p className="empty-hint">Нет матчей в этот день</p>
        )}
      </div>

      {menuOpen && (
        <div className="modal-overlay" onClick={() => setMenuOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Меню</h2>
              <button type="button" className="modal-close" onClick={() => setMenuOpen(false)}>
                ×
              </button>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ marginBottom: '0.5rem' }}
              onClick={() => {
                setMenuOpen(false);
                setShowScoring(true);
              }}
            >
              Как начисляются очки
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ marginBottom: '0.5rem', background: 'var(--card-blue-light)' }}
              onClick={() => {
                setMenuOpen(false);
                navigate(`/league/${id}/settings`);
              }}
            >
              Настройки лиги
            </button>
            <button
              type="button"
              className="btn-primary"
              style={{ background: 'transparent', border: '1px solid var(--text-dim)', color: '#fff' }}
              onClick={() => {
                setMenuOpen(false);
                navigate('/');
              }}
            >
              Все лиги
            </button>
          </div>
        </div>
      )}

      {showScoring && <ScoringModal onClose={() => setShowScoring(false)} />}
    </div>
  );
}
