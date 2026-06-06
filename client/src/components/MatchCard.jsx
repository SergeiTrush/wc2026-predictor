import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import { useConfirm } from '../context/ConfirmContext';
import { loadMatchSquads } from '../teamSquads';
import { teamFlag, formatMatchTime, boosterLabel, isMatchLiveScoreBarVisible, isMatchInPlayWindow, matchHasResult, matchHasLiveScore, matchHasLiveManualScore, matchIsLive, liveBarDisplayScore, scoringActualFromLive, isLiveExtraTime } from '../utils';
import { isKnockoutMatch } from '../matchdays';
import { breakdownMatchPoints, formatPointsBreakdown } from '../scoring';
import PointsTooltip from './PointsTooltip';
import FriendsPredictionsModal, { friendsLinkLabel } from './FriendsPredictionsModal';
import FirstTeamSelect from './FirstTeamSelect';
import FirstPlayerSelect, { NO_FIRST_SCORER } from './FirstPlayerSelect';
import PlusIconButton from './PlusIconButton';
import { resolveFirstPlayerDisplay } from '../predictionExtras';

function firstTeamSelection(value, homeTeam, awayTeam) {
  if (value === 'home') return { label: homeTeam, flag: teamFlag(homeTeam) };
  if (value === 'away') return { label: awayTeam, flag: teamFlag(awayTeam) };
  if (value === 'none') return { label: 'Никто / 0:0', flag: null };
  return null;
}

export default function MatchCard({ match, leagueId, onSaved, boosterMatchId, boosterLocked }) {
  const { alert: showAlert } = useConfirm();
  const pred = match.prediction;
  const [home, setHome] = useState(pred?.home_pred?.toString() ?? '');
  const [away, setAway] = useState(pred?.away_pred?.toString() ?? '');
  const [firstTeam, setFirstTeam] = useState(pred?.first_team ?? '');
  const [firstPlayer, setFirstPlayer] = useState(pred?.first_player ?? '');
  const [saving, setSaving] = useState(false);
  const [boosterSaving, setBoosterSaving] = useState(false);
  const isBoosterHere = Number(boosterMatchId) === Number(match.id);
  const [saved, setSaved] = useState(false);
  const [showFriendsPredictions, setShowFriendsPredictions] = useState(false);
  const [squadPlayers, setSquadPlayers] = useState(null);
  const [squadTeams, setSquadTeams] = useState(null);
  const [squadLoading, setSquadLoading] = useState(false);
  const [squadError, setSquadError] = useState('');

  const hasResult = matchHasResult(match);
  const isLive = matchIsLive(match);
  const liveScore = match.liveScore;
  const displayScore = liveScore ? liveBarDisplayScore(match, liveScore) : null;
  const showLiveScore = hasResult || matchHasLiveScore(match);
  const locked = !!match.locked;
  const liveBarVisible = isMatchLiveScoreBarVisible(match) || isMatchInPlayWindow(match);
  const inputsLocked = liveBarVisible;
  /** One booster per matchday; frozen once the boosted match has started. */
  const canChangeBooster = !inputsLocked && !boosterSaving && !boosterLocked;
  const boosterRowDisabled = !canChangeBooster && !liveBarVisible;
  const boosterOnOtherMatch = boosterLocked && !isBoosterHere;
  const showBoosterStatusLabel = !boosterSaving && (isBoosterHere || liveBarVisible);
  const showBoosterElsewhereLabel = !boosterSaving && boosterOnOtherMatch;

  useEffect(() => {
    if (pred) {
      setHome(pred.home_pred?.toString() ?? '');
      setAway(pred.away_pred?.toString() ?? '');
      setFirstTeam(pred.first_team || '');
      setFirstPlayer(pred.first_player || '');
    }
  }, [pred?.home_pred, pred?.away_pred, pred?.first_team, pred?.first_player]);

  useEffect(() => {
    setSquadPlayers(null);
    setSquadTeams(null);
    setSquadLoading(false);
    setSquadError('');
  }, [match.id]);

  const loadSquadPlayers = useCallback(() => {
    if (squadLoading) return;
    if (squadTeams !== null && !squadError) return;

    setSquadLoading(true);
    setSquadError('');
    loadMatchSquads(match.home_team, match.away_team)
      .then((data) => {
        setSquadTeams(data.teams || []);
        setSquadPlayers(data.players || []);
        setSquadError(data.warnings?.length ? data.warnings.join(' · ') : '');
      })
      .catch((e) => {
        setSquadTeams([]);
        setSquadPlayers([]);
        setSquadError(e?.message || 'Не удалось загрузить игроков');
      })
      .finally(() => setSquadLoading(false));
  }, [squadLoading, squadTeams, squadError, match.home_team, match.away_team]);

  useEffect(() => {
    if (!firstPlayer || firstPlayer === NO_FIRST_SCORER) return;
    if (squadPlayers !== null || squadLoading) return;
    loadSquadPlayers();
  }, [firstPlayer, squadPlayers, squadLoading, loadSquadPlayers]);

  const playerOptions = useMemo(() => {
    if (!Array.isArray(squadPlayers)) return [];
    return squadPlayers;
  }, [squadPlayers]);

  const mult = boosterLabel(match.stage);
  const lockMessage =
    match.lockReason === 'started'
      ? 'Прогнозы закрыты — матч уже начался'
      : 'Прогнозы закрыты';

  const save = async (overrides = {}) => {
    if (inputsLocked) return;
    const h = overrides.homeScore ?? (home === '' ? null : parseInt(home, 10));
    const a = overrides.awayScore ?? (away === '' ? null : parseInt(away, 10));
    if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        matchId: match.id,
        leagueId: leagueId ? Number(leagueId) : undefined,
        homeScore: h,
        awayScore: a,
        firstTeam: overrides.firstTeam ?? (firstTeam || null),
        firstPlayer: overrides.firstPlayer ?? (firstPlayer || null),
      };
      if (overrides.booster !== undefined) {
        payload.booster = overrides.booster;
      }
      await api.savePrediction(payload);
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const moveBooster = async () => {
    if (boosterLocked) {
      showAlert('Бустер закреплён — матч с бустером уже начался');
      return;
    }
    if (!canChangeBooster) return;
    const h = home === '' ? null : parseInt(home, 10);
    const a = away === '' ? null : parseInt(away, 10);
    if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      showAlert('Сначала укажите и сохраните счёт матча');
      return;
    }
    const assignHere = !isBoosterHere;
    setBoosterSaving(true);
    try {
      await api.savePrediction({
        matchId: match.id,
        leagueId: Number(leagueId),
        homeScore: h,
        awayScore: a,
        firstTeam: firstTeam || null,
        firstPlayer: firstPlayer || null,
      });
      await api.setBooster({
        leagueId: Number(leagueId),
        matchId: match.id,
        active: assignHere,
      });
      onSaved?.();
    } catch (e) {
      showAlert(e.message);
    } finally {
      setBoosterSaving(false);
    }
  };

  const onScoreChange = (side, raw) => {
    if (inputsLocked) return;
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (side === 'home') setHome(digits);
    else setAway(digits);
  };

  const friends = match.friendsPredicted || 0;
  const canViewFriendsPredictions = friends > 0 && liveBarVisible && leagueId;
  const hasSavedPrediction = pred?.home_pred != null && pred?.away_pred != null;
  const hasLocalScore = home !== '' && away !== '';

  const footerText = inputsLocked
    ? hasResult
      ? 'Прогнозы закрыты — матч завершён'
      : lockMessage
    : saved
      ? '✓ Сохранено'
      : saving
        ? 'Сохранение…'
        : !hasSavedPrediction && hasLocalScore
          ? 'Нажмите «Сохранить прогноз» выше'
          : !hasSavedPrediction
            ? 'Сделайте прогноз на этот матч'
            : friends === 0
              ? 'Пока только ваш прогноз в лиге'
              : `${friends} ${friends === 1 ? 'друг сделал' : friends < 5 ? 'друга сделали' : 'друзей сделали'} прогноз на этот матч`;

  const canSave = !inputsLocked && home !== '' && away !== '';

  const scoreIsSet = hasLocalScore;
  const missingFirstTeam = scoreIsSet && !firstTeam;
  const missingFirstPlayer = scoreIsSet && !firstPlayer;

  const playerPlaceholder = squadLoading
    ? 'Загрузка…'
    : squadError
      ? 'Нет списка игроков'
      : Array.isArray(squadPlayers) && squadPlayers.length === 0
        ? 'Состав не найден'
        : 'Игрок';

  const pointsDetail = useMemo(() => {
    if (!pred) return null;

    let actual = null;
    if (hasResult) {
      actual = match;
    } else if (matchHasLiveScore(match)) {
      actual = matchHasLiveManualScore(match)
        ? {
            home_score: match.home_score,
            away_score: match.away_score,
            first_scorer_team: match.first_scorer_team ?? null,
            first_scorer_player: match.first_scorer_player ?? null,
            stage: match.stage,
          }
        : scoringActualFromLive(match, liveScore);
    }
    if (!actual) return null;

    const raw = breakdownMatchPoints(
      {
        home_pred: pred.home_pred,
        away_pred: pred.away_pred,
        first_team: pred.first_team,
        first_player: pred.first_player,
        booster: pred.booster ? 1 : 0,
      },
      actual
    );
    return formatPointsBreakdown(raw);
  }, [match, pred, hasResult, liveScore]);

  const isProvisionalPoints = isLive && !!pointsDetail;

  const selectedFirstTeam = firstTeamSelection(firstTeam, match.home_team, match.away_team);
  const selectedFirstPlayer = useMemo(() => {
    const pick = resolveFirstPlayerDisplay(firstPlayer, squadPlayers ?? []);
    return pick.empty ? null : pick;
  }, [firstPlayer, squadPlayers]);

  const lockBannerText = inputsLocked
    ? hasResult
      ? 'Прогнозы закрыты — матч завершён'
      : lockMessage
    : null;

  return (
    <article className={`match-card ${inputsLocked ? 'match-card-locked' : ''}`}>
      <div className="match-card-header">
        <span>{formatMatchTime(match.kickoff)}</span>
        <span>
          {inputsLocked && <span className="locked-badge">🔒 </span>}
          {match.group_name ? `Группа ${match.group_name}` : match.match_label}
        </span>
      </div>

      {showLiveScore && liveBarVisible && (
        <div className={`live-score-bar ${isLive ? 'live-score-bar--inplay' : ''}`}>
          <div className="live-score-label">
            <span className={`live-tag ${isLive ? 'live-tag--pulse' : ''}`}>
              {hasResult ? 'Счёт матча' : isLive ? 'LIVE' : 'Счёт'}
              {isLive && liveScore?.minute != null ? ` ${liveScore.minute}'` : ''}
              {isLive && isKnockoutMatch(match) && isLiveExtraTime(liveScore) ? ' · доп. время' : ''}
            </span>
            <span className={`live-score${isLive ? ' live-score--provisional' : ''}`}>
              {hasResult
                ? `${match.home_score} : ${match.away_score}`
                : matchHasLiveManualScore(match)
                  ? `${match.home_score} : ${match.away_score}`
                  : displayScore
                    ? `${displayScore.home} : ${displayScore.away}`
                    : `${liveScore.homeScore} : ${liveScore.awayScore}`}
            </span>
          </div>
          {pointsDetail ? (
            <PointsTooltip pointsDetail={pointsDetail} provisional={isProvisionalPoints} />
          ) : showLiveScore ? (
            <span className="points-no-pred">Нет прогноза</span>
          ) : null}
        </div>
      )}

      {liveBarVisible && !showLiveScore && (
        <div className="live-score-bar live-score-pending">
          <span className="live-tag">Матч идёт</span>
          <span className="live-score-muted">Результат скоро появится</span>
        </div>
      )}

      <div className="match-teams">
        <div className="team-col">
          <div className="team-flag">{teamFlag(match.home_team)}</div>
          <div className="team-name">{match.home_team}</div>
        </div>
        <div className="score-boxes">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="score-box"
            value={home}
            onChange={(e) => onScoreChange('home', e.target.value)}
            readOnly={inputsLocked}
            disabled={inputsLocked}
            aria-label={`Прогноз ${match.home_team}`}
          />
          <span className="score-sep">:</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="score-box"
            value={away}
            onChange={(e) => onScoreChange('away', e.target.value)}
            readOnly={inputsLocked}
            disabled={inputsLocked}
            aria-label={`Прогноз ${match.away_team}`}
          />
        </div>
        <div className="team-col">
          <div className="team-flag">{teamFlag(match.away_team)}</div>
          <div className="team-name">{match.away_team}</div>
        </div>
      </div>

      {!inputsLocked && (
        <div style={{ padding: '0 1rem 0.5rem', textAlign: 'center' }}>
          <button
            type="button"
            className="btn-save-prediction"
            disabled={!canSave || saving}
            onClick={() => save()}
          >
            Сохранить прогноз
          </button>
        </div>
      )}

      <div className="extra-predictions">
        <div className={`extra-row ${missingFirstTeam ? 'extra-row--missing' : ''}`}>
          <span className="extra-row-label">
            Какая команда откроет счёт
            {missingFirstTeam && (
              <span className="extra-row-missing-hint">Не выбрано</span>
            )}
          </span>
          <div className="extra-row-picker">
            {selectedFirstTeam ? (
              <span className="extra-row-selection" title={selectedFirstTeam.label}>
                {selectedFirstTeam.flag ? (
                  <span className="extra-row-selection-flag" aria-hidden="true">
                    {selectedFirstTeam.flag}
                  </span>
                ) : null}
                <span className="extra-row-selection-text">{selectedFirstTeam.label}</span>
              </span>
            ) : missingFirstTeam ? (
              <span className="extra-row-missing" aria-hidden="true">
                —
              </span>
            ) : null}
            <FirstTeamSelect
              value={firstTeam}
              onChange={(next) => {
                setFirstTeam(next);
                if (canSave) save({ firstTeam: next || null });
              }}
              homeTeam={match.home_team}
              awayTeam={match.away_team}
              disabled={inputsLocked}
              triggerVariant="icon"
            />
          </div>
        </div>
        <div className={`extra-row ${missingFirstPlayer ? 'extra-row--missing' : ''}`}>
          <span className="extra-row-label">
            Какой игрок откроет счёт
            {missingFirstPlayer && (
              <span className="extra-row-missing-hint">Не выбрано</span>
            )}
          </span>
          <div className="extra-row-picker">
            {selectedFirstPlayer ? (
              <span className="extra-row-selection" title={selectedFirstPlayer.label}>
                {selectedFirstPlayer.flag ? (
                  <span className="extra-row-selection-flag" aria-hidden="true">
                    {selectedFirstPlayer.flag}
                  </span>
                ) : null}
                <span className="extra-row-selection-text">{selectedFirstPlayer.label}</span>
              </span>
            ) : missingFirstPlayer ? (
              <span className="extra-row-missing" aria-hidden="true">
                —
              </span>
            ) : null}
            <FirstPlayerSelect
              value={firstPlayer}
              onChange={(next) => {
                setFirstPlayer(next);
                if (canSave) save({ firstPlayer: next || null });
              }}
              teams={squadTeams}
              players={playerOptions}
              loading={squadLoading}
              placeholder={playerPlaceholder}
              disabled={inputsLocked}
              triggerVariant="icon"
              title={squadError || undefined}
              onOpen={loadSquadPlayers}
            />
          </div>
        </div>
        {squadError && !inputsLocked && (
          <p className="squad-hint squad-hint--error">{squadError}</p>
        )}
        <div
          className={`extra-row booster-row ${isBoosterHere ? 'booster-active' : ''} ${boosterRowDisabled ? 'booster-row-disabled' : ''}`}
        >
          <span>
            {boosterOnOtherMatch ? `Бустер на другом матче тура` : `Переставить бустер ${mult}`}
          </span>
          <div className="extra-row-picker booster-row-picker">
            {showBoosterElsewhereLabel ? (
              <span className="extra-row-selection extra-row-selection--booster-inactive" title="Уже активировано">
                <span className="extra-row-selection-text">Уже активировано</span>
              </span>
            ) : showBoosterStatusLabel ? (
              <span
                className={`extra-row-selection${isBoosterHere ? ' extra-row-selection--booster' : ' extra-row-selection--booster-inactive'}`}
                title={isBoosterHere ? 'Активирован' : 'Не активирован'}
              >
                <span className="extra-row-selection-text">
                  {isBoosterHere ? 'Активирован' : 'Не активирован'}
                </span>
              </span>
            ) : null}
            {boosterSaving ? (
              <span className="booster-row-status">…</span>
            ) : (
              <PlusIconButton
                active={isBoosterHere}
                disabled={!canChangeBooster}
                onClick={() => moveBooster()}
                ariaLabel={isBoosterHere ? 'Снять бустер с матча' : `Поставить бустер ${mult}`}
              />
            )}
          </div>
        </div>
      </div>

      {(canViewFriendsPredictions || !inputsLocked) && (
        <div className="match-card-footer">
          {canViewFriendsPredictions ? (
            <button
              type="button"
              className="friends-predictions-link"
              onClick={() => setShowFriendsPredictions(true)}
            >
              {friendsLinkLabel(friends)}
            </button>
          ) : (
            footerText
          )}
        </div>
      )}

      {lockBannerText && (
        <p className="match-card-status" role="status">
          {lockBannerText}
        </p>
      )}

      {showFriendsPredictions && (
        <FriendsPredictionsModal
          leagueId={leagueId}
          match={match}
          onClose={() => setShowFriendsPredictions(false)}
        />
      )}
    </article>
  );
}
