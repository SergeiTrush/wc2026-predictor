import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import AppHeader from '../components/AppHeader';
import MatchCard from '../components/MatchCard';
import ScoringModal from '../components/ScoringModal';

function pickDefaultMatchday(days) {
  if (!days.length) return '';
  const today = new Date().toISOString().slice(0, 10);
  return days.find((day) => day >= today) || days[0];
}

export default function LeaguePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [matchdays, setMatchdays] = useState([]);
  const [matchday, setMatchday] = useState('');
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showScoring, setShowScoring] = useState(false);

  const loadMatches = useCallback(
    (day) => {
      setLoading(true);
      setError('');
      const params = { leagueId: id };
      if (day) params.matchday = day;

      api
        .matches(params)
        .then((d) => {
          setMatches(d.matches);
          if (d.matches.length === 0 && day) {
            return api.matches({ leagueId: id }).then((all) => {
              if (all.matches.length > 0) setMatches(all.matches);
            });
          }
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [id]
  );

  useEffect(() => {
    api.league(id).then((d) => setLeague(d.league)).catch(() => {});

    api
      .matchdays()
      .then((d) => {
        const days = d.matchdays || [];
        setMatchdays(days);
        const picked = pickDefaultMatchday(days);
        setMatchday(picked);
        if (!picked) {
          loadMatches('');
        }
      })
      .catch((e) => {
        setError(e.message);
        loadMatches('');
      });
  }, [id, loadMatches]);

  useEffect(() => {
    if (matchday) {
      loadMatches(matchday);
    }
  }, [matchday, loadMatches]);

  const friendsActive = matches.reduce((n, m) => n + (m.friendsPredicted > 0 ? 1 : 0), 0);

  return (
    <div className="app-root">
      <AppHeader active="matches" leagueId={id} onOpenMenu={() => setMenuOpen(true)} />

      {friendsActive > 0 && league && (
        <div className="social-banner">Прогнозы друзей в лиге «{league.name}» →</div>
      )}

      {matchdays.length > 0 && (
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
      )}

      <div className="page-content">
        {error && <div className="error-banner">{error}</div>}
        {loading && <p className="empty-hint">Загрузка матчей…</p>}
        {!loading &&
          matches.map((m) => (
            <MatchCard key={m.id} match={m} leagueId={id} onSaved={() => loadMatches(matchday)} />
          ))}
        {!loading && !error && matches.length === 0 && (
          <p className="empty-hint">
            {matchdays.length === 0
              ? 'Расписание не загружено. Перезапустите сервер или обновите страницу.'
              : 'Нет матчей на выбранный день — выберите другую дату выше.'}
          </p>
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
