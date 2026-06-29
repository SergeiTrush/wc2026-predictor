import { useEffect, useRef, useState } from 'react';
import { api, isSessionExpiredError } from '../api';
import { loadMatchSquads } from '../teamSquads';
import { teamFlag, boosterLabel, matchHasResult, matchHasLiveScore, matchIsLive, isLiveExtraTime, liveBarScoreText, provisionalScoringActual } from '../utils';
import { isKnockoutMatch, isKnockoutExtraTime } from '../matchdays';
import { breakdownMatchPoints, formatPointsBreakdown, enrichScoringActual } from '../scoring';
import ModalOverlay from './ModalOverlay';
import PointsTooltip from './PointsTooltip';
import PointsBreakdownPanel from './PointsBreakdownPanel';
import FriendsPredictionExtras from './FriendsPredictionExtras';

function friendsLinkLabel(count) {
  if (count === 1) return 'Посмотреть прогноз твоего друга';
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'друга' : 'друзей';
  return `Посмотреть прогнозы твоих ${count} ${word}`;
}

function resolvePredictionPoints(prediction, displayMatch) {
  const hasResult = matchHasResult(displayMatch);
  const liveScore = displayMatch.liveScore;
  if (!hasResult && !matchHasLiveScore(displayMatch)) return null;

  const actual = hasResult
    ? enrichScoringActual(displayMatch)
    : provisionalScoringActual(displayMatch);
  if (!actual) return null;

  const suggestions = displayMatch.suggestedScores;
  let underdogBonus = 0;
  if (
    actual?.home_score != null &&
    actual?.away_score != null &&
    prediction.home_pred === actual.home_score &&
    prediction.away_pred === actual.away_score &&
    suggestions?.length
  ) {
    const isPopular = suggestions.some(
      (s) => s.home === prediction.home_pred && s.away === prediction.away_pred
    );
    if (!isPopular) underdogBonus = 5;
  }

  const raw = breakdownMatchPoints(
    {
      home_pred: prediction.home_pred,
      away_pred: prediction.away_pred,
      first_team: prediction.first_team,
      first_player: prediction.first_player,
      booster: prediction.booster ? 1 : 0,
    },
    actual,
    { underdogBonus }
  );

  const provisional = !hasResult;
  const showTilde = provisional && !isKnockoutExtraTime(displayMatch, displayMatch.liveScore);

  return {
    pointsDetail: formatPointsBreakdown(raw),
    provisional,
    showTilde,
  };
}

export { friendsLinkLabel };

export default function FriendsPredictionsModal({ leagueId, match, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [matchInfo, setMatchInfo] = useState(null);
  const [squadPlayers, setSquadPlayers] = useState([]);

  const ownPrediction =
    match.prediction?.home_pred != null && match.prediction?.away_pred != null
      ? match.prediction
      : null;

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
        if (!cancelled && !isSessionExpiredError(e)) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, match, match.id, match.friendPredictions]);

  const displayMatch = matchInfo || match;

  useEffect(() => {
    if (!displayMatch?.home_team || !displayMatch?.away_team) {
      setSquadPlayers([]);
      return undefined;
    }

    let cancelled = false;
    loadMatchSquads(displayMatch.home_team, displayMatch.away_team)
      .then((squads) => {
        if (!cancelled) setSquadPlayers(squads.players || []);
      })
      .catch(() => {
        if (!cancelled) setSquadPlayers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [displayMatch?.home_team, displayMatch?.away_team]);
  const hasResult = matchHasResult(displayMatch);
  const isLive = matchIsLive(displayMatch);
  const liveScore = displayMatch.liveScore;
  const showLiveScore = hasResult || matchHasLiveScore(displayMatch);
  const liveScoreText = liveBarScoreText(displayMatch)?.replace(/\s/g, '') ?? null;

  const title = displayMatch
    ? `${displayMatch.home_team} ${teamFlag(displayMatch.home_team)} — ${teamFlag(displayMatch.away_team)} ${displayMatch.away_team}`
    : 'Прогнозы друзей';

  const mult = boosterLabel(match.stage);

  return (
    <ModalOverlay className="modal-overlay--center" onClick={onClose}>
      <div className="modal-sheet friends-predictions-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header friends-predictions-header">
          <div className="modal-header-title-row">
            <h2>{title}</h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
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

        {loading && <p className="empty-hint">Загрузка…</p>}
        {error && <p className="error-banner">{error}</p>}

        <div className="friends-predictions-body">
          {!loading && !error && predictions.length === 0 && !ownPrediction && (
            <p className="empty-hint">Пока нет прогнозов от других участников</p>
          )}

          <div className="friends-predictions-scroll">
            <ul className="friends-predictions-list">
              {ownPrediction && (
                <FriendPredictionRow
                  key="self"
                  prediction={{ ...ownPrediction, name: 'Ты' }}
                  points={resolvePredictionPoints(ownPrediction, displayMatch)}
                  mult={mult}
                  displayMatch={displayMatch}
                  squadPlayers={squadPlayers}
                  isSelf
                />
              )}
              {predictions.map((p) => {
                const points = resolvePredictionPoints(p, displayMatch);

                return (
                  <FriendPredictionRow
                    key={p.userId}
                    prediction={p}
                    points={points}
                    mult={mult}
                    displayMatch={displayMatch}
                    squadPlayers={squadPlayers}
                  />
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function FriendPredictionRow({ prediction: p, points, mult, displayMatch, squadPlayers, isSelf = false }) {
  const rowRef = useRef(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  return (
    <li className={`friends-prediction-row${isSelf ? ' friends-prediction-row--self' : ''}`} ref={rowRef}>
      <div className="friends-prediction-header">
        <div className="friends-prediction-top-main">
          <div className="friends-prediction-name">{p.name}</div>
          <span className="friends-prediction-score">
            {p.home_pred}:{p.away_pred}
            {p.booster ? <span className="friends-booster-tag">бустер {mult}</span> : null}
          </span>
        </div>
        {points?.pointsDetail && (
          <PointsTooltip
            pointsDetail={points.pointsDetail}
            provisional={points.provisional}
            showTilde={points.showTilde}
            variant="inline"
            detachPanel
            wrapRef={rowRef}
            onOpenChange={setBreakdownOpen}
          />
        )}
      </div>
      <FriendsPredictionExtras
        firstTeam={p.first_team}
        firstPlayer={p.first_player}
        homeTeam={displayMatch.home_team}
        awayTeam={displayMatch.away_team}
        squadPlayers={squadPlayers}
      />
      {breakdownOpen && points?.pointsDetail && (
        <PointsBreakdownPanel
          pointsDetail={points.pointsDetail}
          className="points-breakdown-inline friends-prediction-breakdown"
          provisional={points.provisional}
        />
      )}
    </li>
  );
}
