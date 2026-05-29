import { useEffect, useState } from 'react';
import { api } from '../api';
import { teamFlag, boosterLabel } from '../utils';
import PointsBreakdownPanel from './PointsBreakdownPanel';

function formatFirstTeam(value, homeTeam, awayTeam) {
  if (value === 'home') return homeTeam;
  if (value === 'away') return awayTeam;
  if (value === 'none') return 'Никто / 0:0';
  return '—';
}

function friendsLinkLabel(count) {
  if (count === 1) return 'Посмотреть прогноз твоего друга';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'друга' : 'друзей';
  return `Посмотреть прогнозы твоих ${count} ${word}`;
}

export { friendsLinkLabel };

export default function FriendsPredictionsModal({ leagueId, match, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [matchInfo, setMatchInfo] = useState(null);
  const [expandedPointsId, setExpandedPointsId] = useState(null);

  useEffect(() => {
    if (match.friendPredictions != null) {
      setPredictions(match.friendPredictions);
      setMatchInfo(match);
      setLoading(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .matchFriendPredictions(leagueId, match.id)
      .then((data) => {
        if (cancelled) return;
        setPredictions(data.predictions || []);
        setMatchInfo(data.match || match);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, match, match.id, match.friendPredictions]);

  const title = matchInfo
    ? `${matchInfo.home_team} ${teamFlag(matchInfo.home_team)} — ${teamFlag(matchInfo.away_team)} ${matchInfo.away_team}`
    : 'Прогнозы друзей';

  const mult = boosterLabel(match.stage);

  return (
    <div className="modal-overlay modal-overlay--center" onClick={onClose}>
      <div className="modal-sheet friends-predictions-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {loading && <p className="empty-hint">Загрузка…</p>}
        {error && <p className="error-banner">{error}</p>}

        <div className="friends-predictions-body">
          {!loading && !error && predictions.length === 0 && (
            <p className="empty-hint">Пока нет прогнозов от других участников</p>
          )}

          <ul className="friends-predictions-list">
            {predictions.map((p) => {
              const hasBreakdown = p.pointsDetail?.lines?.length > 0;
              const pointsOpen = expandedPointsId === p.userId;

              return (
                <li key={p.userId} className="friends-prediction-row">
                  <div className="friends-prediction-name">{p.name}</div>
                  <div className="friends-prediction-head">
                    <span className="friends-prediction-score">
                      {p.home_pred}:{p.away_pred}
                      {p.booster ? <span className="friends-booster-tag">бустер {mult}</span> : null}
                    </span>
                    {p.points != null && (
                      <span className="points-tooltip-wrap">
                        <span className="points-badge">+{p.points} оч.</span>
                        {hasBreakdown && (
                          <button
                            type="button"
                            className="points-info-btn"
                            aria-label="Как начислены очки"
                            aria-expanded={pointsOpen}
                            onClick={() =>
                              setExpandedPointsId(pointsOpen ? null : p.userId)
                            }
                          >
                            i
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="friends-prediction-meta">
                    Первый гол: {formatFirstTeam(p.first_team, match.home_team, match.away_team)}
                    {p.first_player ? ` · ${p.first_player}` : ''}
                  </div>
                  {pointsOpen && hasBreakdown && (
                    <PointsBreakdownPanel
                      pointsDetail={p.pointsDetail}
                      className="friends-points-breakdown"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
