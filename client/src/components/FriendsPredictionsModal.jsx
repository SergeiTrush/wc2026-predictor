import { useEffect, useState } from 'react';
import { api } from '../api';
import { teamFlag, boosterLabel, matchHasResult, matchHasLiveScore, matchHasLiveManualScore, matchIsLive, liveBarDisplayScore, scoringActualFromLive, isLiveExtraTime } from '../utils';
import { isKnockoutMatch } from '../matchdays';
import { breakdownMatchPoints, formatPointsBreakdown } from '../scoring';
import ModalOverlay from './ModalOverlay';
import PointsTooltip from './PointsTooltip';

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

function resolvePredictionPoints(prediction, displayMatch) {
  if (prediction.pointsDetail) {
    return {
      pointsDetail: prediction.pointsDetail,
      provisional: !!prediction.provisional,
    };
  }

  const hasResult = matchHasResult(displayMatch);
  const liveScore = displayMatch.liveScore;
  if (!hasResult && !matchHasLiveScore(displayMatch)) return null;

  const actual = hasResult
    ? displayMatch
    : matchHasLiveManualScore(displayMatch)
      ? {
          home_score: displayMatch.home_score,
          away_score: displayMatch.away_score,
          first_scorer_team: displayMatch.first_scorer_team ?? null,
          first_scorer_player: displayMatch.first_scorer_player ?? null,
          stage: displayMatch.stage,
        }
      : scoringActualFromLive(displayMatch, liveScore);

  const raw = breakdownMatchPoints(
    {
      home_pred: prediction.home_pred,
      away_pred: prediction.away_pred,
      first_team: prediction.first_team,
      first_player: prediction.first_player,
      booster: prediction.booster ? 1 : 0,
    },
    actual
  );

  return {
    pointsDetail: formatPointsBreakdown(raw),
    provisional: !hasResult,
  };
}

export { friendsLinkLabel };

export default function FriendsPredictionsModal({ leagueId, match, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [matchInfo, setMatchInfo] = useState(null);

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

  const displayMatch = matchInfo || match;
  const hasResult = matchHasResult(displayMatch);
  const isLive = matchIsLive(displayMatch);
  const liveScore = displayMatch.liveScore;
  const displayScore = liveScore ? liveBarDisplayScore(displayMatch, liveScore) : null;
  const showLiveScore = hasResult || matchHasLiveScore(displayMatch);
  const liveScoreText = hasResult
    ? `${displayMatch.home_score}:${displayMatch.away_score}`
    : matchHasLiveManualScore(displayMatch)
      ? `${displayMatch.home_score}:${displayMatch.away_score}`
      : displayScore
        ? `${displayScore.home}:${displayScore.away}`
        : `${liveScore?.homeScore}:${liveScore?.awayScore}`;

  const title = displayMatch
    ? `${displayMatch.home_team} ${teamFlag(displayMatch.home_team)} — ${teamFlag(displayMatch.away_team)} ${displayMatch.away_team}`
    : 'Прогнозы друзей';

  const mult = boosterLabel(match.stage);

  return (
    <ModalOverlay className="modal-overlay--center" onClick={onClose}>
      <div className="modal-sheet friends-predictions-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {showLiveScore && (
              <p className={`friends-predictions-live-score${isLive ? ' friends-predictions-live-score--live' : ''}`}>
                {hasResult ? 'Счёт матча' : isLive ? 'LIVE' : 'Текущий счёт'}
                {': '}
                {liveScoreText}
                {isLive && liveScore?.minute != null ? ` (${liveScore.minute}'` : ''}
                {isLive && isKnockoutMatch(displayMatch) && isLiveExtraTime(liveScore) ? ', доп. время' : ''}
                {isLive && liveScore?.minute != null ? ')' : ''}
              </p>
            )}
          </div>
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
              const points = resolvePredictionPoints(p, displayMatch);

              return (
                <li key={p.userId} className="friends-prediction-row">
                  <div className="friends-prediction-name">{p.name}</div>
                  <div className="friends-prediction-head">
                    <span className="friends-prediction-score">
                      {p.home_pred}:{p.away_pred}
                      {p.booster ? <span className="friends-booster-tag">бустер {mult}</span> : null}
                    </span>
                    {points?.pointsDetail && (
                      <PointsTooltip
                        pointsDetail={points.pointsDetail}
                        provisional={points.provisional}
                        variant="inline"
                      />
                    )}
                  </div>
                  <div className="friends-prediction-meta">
                    Первый гол: {formatFirstTeam(p.first_team, match.home_team, match.away_team)}
                    {p.first_player ? ` · ${p.first_player}` : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ModalOverlay>
  );
}
