import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import { loadMatchSquads } from '../teamSquads';
import { teamFlag, formatMatchTime, boosterLabel, isMatchLiveScoreBarVisible, matchHasResult } from '../utils';
import { breakdownMatchPoints, formatPointsBreakdown } from '../scoring';
import PointsTooltip from './PointsTooltip';
import FriendsPredictionsModal, { friendsLinkLabel } from './FriendsPredictionsModal';

export default function MatchCard({ match, leagueId, onSaved, boosterMatchId, boosterLocked }) {
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
  const [squadLoading, setSquadLoading] = useState(false);
  const [squadError, setSquadError] = useState('');

  const hasResult = match.hasResult ?? matchHasResult(match);
  const locked = !!match.locked;
  const liveBarVisible = isMatchLiveScoreBarVisible(match);
  const inputsLocked = liveBarVisible;
  /** One booster per matchday; frozen once the boosted match has started. */
  const canChangeBooster = !inputsLocked && !boosterSaving && !boosterLocked;

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
    setSquadLoading(false);
    setSquadError('');
  }, [match.id]);

  const loadSquadPlayers = useCallback(() => {
    if (inputsLocked || squadLoading || Array.isArray(squadPlayers)) return;
    setSquadLoading(true);
    setSquadError('');
    loadMatchSquads(match.home_team, match.away_team)
      .then((merged) => setSquadPlayers(merged))
      .catch((e) => {
        setSquadPlayers([]);
        setSquadError(e?.message || 'Не удалось загрузить игроков');
      })
      .finally(() => setSquadLoading(false));
  }, [inputsLocked, squadLoading, squadPlayers, match.home_team, match.away_team]);

  useEffect(() => {
    if (inputsLocked) return;
    loadSquadPlayers();
  }, [match.id, inputsLocked, loadSquadPlayers]);

  const playerOptions = useMemo(() => {
    if (!Array.isArray(squadPlayers)) return [];
    if (firstTeam === 'home' || firstTeam === 'away') {
      const teamName = firstTeam === 'home' ? match.home_team : match.away_team;
      return squadPlayers.filter((p) => p.team === teamName);
    }
    return squadPlayers;
  }, [squadPlayers, firstTeam, match.home_team, match.away_team]);

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
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const moveBooster = async () => {
    if (boosterLocked) {
      alert('Бустер закреплён — матч с бустером уже начался');
      return;
    }
    if (!canChangeBooster) return;
    const h = home === '' ? null : parseInt(home, 10);
    const a = away === '' ? null : parseInt(away, 10);
    if (h == null || a == null || Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      alert('Сначала укажите и сохраните счёт матча');
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
      alert(e.message);
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

  const playerPlaceholder = squadLoading
    ? 'Загрузка…'
    : squadError
      ? 'Нет списка игроков'
      : Array.isArray(squadPlayers) && squadPlayers.length === 0
        ? 'Состав не найден'
        : 'Фамилия';

  const pointsDetail = useMemo(() => {
    if (match.pointsDetail) return match.pointsDetail;
    if (!hasResult || !pred) return null;
    const raw = breakdownMatchPoints(
      {
        home_pred: pred.home_pred,
        away_pred: pred.away_pred,
        first_team: pred.first_team,
        first_player: pred.first_player,
        booster: pred.booster ? 1 : 0,
      },
      match,
      []
    );
    return formatPointsBreakdown(raw);
  }, [match, pred, hasResult]);

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

      {hasResult && liveBarVisible && (
        <div className="live-score-bar">
          <div className="live-score-label">
            <span className="live-tag">Счёт матча</span>
            <span className="live-score">
              {match.home_score} : {match.away_score}
            </span>
          </div>
          {pointsDetail ? (
            <PointsTooltip pointsDetail={pointsDetail} />
          ) : (
            <span className="points-no-pred">Нет прогноза</span>
          )}
        </div>
      )}

      {liveBarVisible && !hasResult && (
        <div className="live-score-bar live-score-pending">
          <span className="live-tag">Матч идёт</span>
          <span className="live-score-muted">Результат появится после финального свистка</span>
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
        <div className="extra-row">
          <span>Какая команда откроет счёт</span>
          <select
            value={firstTeam}
            onChange={(e) => setFirstTeam(e.target.value)}
            onBlur={() => canSave && save()}
            disabled={inputsLocked}
          >
            <option value="">—</option>
            <option value="home">{match.home_team}</option>
            <option value="away">{match.away_team}</option>
            <option value="none">Никто / 0:0</option>
          </select>
        </div>
        <div className="extra-row">
          <span>Какой игрок откроет счёт</span>
          <select
            value={firstPlayer}
            onChange={(e) => setFirstPlayer(e.target.value)}
            onFocus={loadSquadPlayers}
            onMouseDown={loadSquadPlayers}
            onBlur={() => canSave && save()}
            disabled={inputsLocked}
            title={squadError || undefined}
          >
            <option value="">{playerPlaceholder}</option>
            {playerOptions.map((p) => (
              <option key={`${p.team}-${p.id}`} value={p.surname}>
                {p.surname}
                {firstTeam !== 'home' && firstTeam !== 'away' ? ` (${p.team})` : ''}
                {p.number != null ? ` #${p.number}` : ''}
              </option>
            ))}
          </select>
        </div>
        {squadError && !inputsLocked && (
          <p className="squad-hint squad-hint--error">{squadError}</p>
        )}
        <div
          className={`extra-row booster-row ${isBoosterHere ? 'booster-active' : ''} ${!canChangeBooster ? 'booster-row-disabled' : ''}`}
          onClick={() => moveBooster()}
          role="button"
          tabIndex={canChangeBooster ? 0 : -1}
          aria-disabled={!canChangeBooster}
          onKeyDown={(e) => e.key === 'Enter' && canChangeBooster && moveBooster()}
        >
          <span>
            {boosterLocked && !isBoosterHere
              ? `Бустер на другом матче тура`
              : `Переставить бустер ${mult}`}
          </span>
          <span>
            {boosterSaving
              ? '…'
              : isBoosterHere
                ? boosterLocked
                  ? `🔒 ${mult}`
                  : `✓ ${mult} активен`
                : '+'}
          </span>
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
