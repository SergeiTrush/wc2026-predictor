/** Client copy of shared/scoring.js — keep booster rules in sync with shared/scoring.js */

import { findSquadPlayer } from './predictionExtras';

function boosterMultiplier(stage) {
  if (stage === 'semi_final' || stage === 'third_place' || stage === 'final') return 3;
  return 2;
}

function toScore(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function outcomeSign(home, away) {
  return Math.sign(toScore(home) - toScore(away));
}

function normalizePlayer(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/#\d+/g, '')
    .trim();
}

function playerSurname(name) {
  const parts = normalizePlayer(name).split(/[\s.-]+/).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  if (last.length <= 2 && parts.length >= 2) return parts[parts.length - 2];
  return last;
}

function playersMatch(pred, actual) {
  const a = normalizePlayer(pred);
  const b = normalizePlayer(actual);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const sa = playerSurname(pred);
  const sb = playerSurname(actual);
  return sa.length >= 3 && sa === sb;
}

function firstTeamMatches(predTeam, actualTeam, homeTeam, awayTeam) {
  if (!predTeam || !actualTeam) return false;
  if (predTeam === 'none') {
    return actualTeam === 'none';
  }
  if (homeTeam && awayTeam) {
    const predSide = scorerSide(predTeam, homeTeam, awayTeam);
    const actualSide = scorerSide(actualTeam, homeTeam, awayTeam);
    if (predSide && actualSide && predSide !== 'none' && actualSide !== 'none') {
      return predSide === actualSide;
    }
  }
  return predTeam === actualTeam;
}

function isNoScorerPrediction(firstPlayer) {
  return firstPlayer === 'none';
}

function isNoGoalMatch(homeScore, awayScore) {
  return toScore(homeScore) === 0 && toScore(awayScore) === 0;
}

function goalsWereScored(actual, actualHome, actualAway) {
  if (!isNoGoalMatch(actualHome, actualAway)) return true;
  const team = actual?.first_scorer_team;
  if (team && team !== 'none') return true;
  const player = actual?.first_scorer_player;
  if (player && player !== 'none') return true;
  return false;
}

function scorerSide(teamKey, homeTeam, awayTeam) {
  if (!teamKey || teamKey === 'none') return teamKey;
  if (teamKey === 'home' || teamKey === 'away') return teamKey;
  if (homeTeam && teamKey === homeTeam) return 'home';
  if (awayTeam && teamKey === awayTeam) return 'away';
  return null;
}

function isFirstScorerOwnGoal(actual) {
  if (actual.first_scorer_is_own_goal === 1 || actual.firstScorerIsOwnGoal === true) return true;
  if (actual.first_scorer_is_own_goal === 0 || actual.firstScorerIsOwnGoal === false) return false;

  const homeTeam = actual.home_team;
  const awayTeam = actual.away_team;
  if (!homeTeam || !awayTeam) return false;

  const scorerSideKey = scorerSide(actual.first_scorer_team, homeTeam, awayTeam);
  const playerSideKey = scorerSide(actual.first_scorer_player_team, homeTeam, awayTeam);
  if (
    scorerSideKey &&
    playerSideKey &&
    scorerSideKey !== 'none' &&
    playerSideKey !== 'none'
  ) {
    return scorerSideKey !== playerSideKey;
  }
  return false;
}

export function buildScoringActual(match, scoreOverrides = {}) {
  if (!match) return scoreOverrides;
  return {
    home_score: toScore(scoreOverrides.home_score ?? match.home_score),
    away_score: toScore(scoreOverrides.away_score ?? match.away_score),
    first_scorer_team: match.first_scorer_team ?? null,
    first_scorer_player: match.first_scorer_player ?? null,
    first_scorer_player_team: match.first_scorer_player_team ?? null,
    first_scorer_is_own_goal: match.first_scorer_is_own_goal ?? null,
    home_team: match.home_team,
    away_team: match.away_team,
    stage: match.stage,
  };
}

function firstScorerPlayerSameTeam(actual) {
  const homeTeam = actual.home_team;
  const awayTeam = actual.away_team;

  const scorerSideKey = scorerSide(actual.first_scorer_team, homeTeam, awayTeam);
  if (!scorerSideKey || scorerSideKey === 'none') return false;

  let playerSideKey = scorerSide(actual.first_scorer_player_team, homeTeam, awayTeam);
  if ((!playerSideKey || playerSideKey === 'none') && actual.first_scorer_player) {
    if (isFirstScorerOwnGoal(actual)) return false;
    playerSideKey = scorerSideKey;
  }
  if (!playerSideKey || playerSideKey === 'none') return false;
  return scorerSideKey === playerSideKey;
}

function firstScorerPlayerPointsEligible(actual) {
  if (!actual.first_scorer_player || actual.first_scorer_player === 'none') return false;
  if (isNoGoalMatch(toScore(actual.home_score), toScore(actual.away_score))) return false;
  return firstScorerPlayerSameTeam(actual);
}

function normalizePredictionForScoring(pred) {
  if (!pred) return pred;
  return {
    ...pred,
    home_pred: toScore(pred.home_pred),
    away_pred: toScore(pred.away_pred),
    booster: pred.booster ? 1 : 0,
  };
}

function inferPlayerSide(playerName, homeTeam, awayTeam, squadPlayers) {
  if (!playerName || playerName === 'none' || !Array.isArray(squadPlayers)) return null;
  const found = findSquadPlayer(squadPlayers, playerName);
  if (!found?.team) return null;
  if (found.team === homeTeam) return 'home';
  if (found.team === awayTeam) return 'away';
  return null;
}

/** Repair mistaken ET split where regulation wasn't a draw but final aggregate differs. */
function repairMisSplitRegulationScores(match) {
  if (match?.home_score == null || match?.away_score == null) return null;
  const home = Number(match.home_score);
  const away = Number(match.away_score);
  const fh = match.final_home_score != null ? Number(match.final_home_score) : null;
  const fa = match.final_away_score != null ? Number(match.final_away_score) : null;
  if (fh == null || fa == null || Number.isNaN(fh) || Number.isNaN(fa)) return { home, away };
  if (home === away && home > 0) return { home, away };
  if (home !== fh || away !== fa) return { home: fh, away: fa };
  return { home, away };
}

/** Repair stale 0:0 regulation scores using final score metadata (client fallback). */
function applyClientRegulationRepair(match, scoreOverrides = {}) {
  const misSplit = repairMisSplitRegulationScores(match);
  if (misSplit && (misSplit.home !== Number(match.home_score) || misSplit.away !== Number(match.away_score))) {
    return { home_score: misSplit.home, away_score: misSplit.away };
  }

  const home = toScore(scoreOverrides.home_score ?? match.home_score);
  const away = toScore(scoreOverrides.away_score ?? match.away_score);
  if (home !== 0 || away !== 0) {
    return {
      home_score: home,
      away_score: away,
    };
  }

  const finalTotal =
    (toScore(match.final_home_score) ?? 0) + (toScore(match.final_away_score) ?? 0);
  const hasScorer =
    (match.first_scorer_player && match.first_scorer_player !== 'none') ||
    (match.first_scorer_team && match.first_scorer_team !== 'none');
  if (finalTotal <= 0 && !hasScorer) {
    return { home_score: home, away_score: away };
  }

  const fh = toScore(match.final_home_score);
  const fa = toScore(match.final_away_score);
  if (fh != null && fa != null && fh + fa > 0) {
    return { home_score: fh, away_score: fa };
  }

  return { home_score: home, away_score: away };
}

/** Resolve first-scorer team metadata for live/provisional client scoring. */
export function enrichScoringActual(match, scoreOverrides = {}, squadPlayers = null) {
  const repairedScores = applyClientRegulationRepair(match, scoreOverrides);
  const base = buildScoringActual(match, { ...scoreOverrides, ...repairedScores });
  let playerTeam = base.first_scorer_player_team || null;
  if (!playerTeam && base.first_scorer_player) {
    playerTeam = inferPlayerSide(base.first_scorer_player, base.home_team, base.away_team, squadPlayers);
  }
  if (!playerTeam && base.first_scorer_player && base.first_scorer_team && base.first_scorer_is_own_goal !== 1) {
    const scorerSideKey = scorerSide(base.first_scorer_team, base.home_team, base.away_team);
    if (scorerSideKey && scorerSideKey !== 'none') {
      playerTeam = scorerSideKey;
    }
  }

  let isOwnGoal = base.first_scorer_is_own_goal;
  if (isOwnGoal == null && playerTeam && base.first_scorer_team) {
    const scorerSideKey = scorerSide(base.first_scorer_team, base.home_team, base.away_team);
    isOwnGoal =
      scorerSideKey &&
      playerTeam &&
      scorerSideKey !== 'none' &&
      playerTeam !== 'none' &&
      scorerSideKey !== playerTeam
        ? 1
        : 0;
  }

  return {
    ...base,
    first_scorer_player_team: playerTeam ?? base.first_scorer_player_team,
    first_scorer_is_own_goal: isOwnGoal ?? base.first_scorer_is_own_goal,
  };
}

export function breakdownMatchPoints(pred, actual, { underdogBonus = 0 } = {}) {
  const empty = {
    outcome: 0,
    homeGoals: 0,
    awayGoals: 0,
    goalDifference: 0,
    firstTeam: 0,
    firstPlayer: 0,
    scoreSubtotal: 0,
    boosterMultiplier: 1,
    afterBooster: 0,
    underdog: 0,
    total: 0,
  };

  if (actual.home_score == null || actual.away_score == null) {
    return empty;
  }

  const normalizedPred = normalizePredictionForScoring(pred);
  const { home_pred, away_pred, first_team, first_player, booster } = normalizedPred;
  const { home_score, away_score, first_scorer_team, first_scorer_player, stage, home_team, away_team } =
    actual;

  const predHome = toScore(home_pred);
  const predAway = toScore(away_pred);
  const actualHome = toScore(home_score);
  const actualAway = toScore(away_score);

  let outcome = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let goalDifference = 0;

  if (outcomeSign(predHome, predAway) === outcomeSign(actualHome, actualAway)) {
    outcome = 3;
  }
  if (predHome === actualHome) homeGoals = 2;
  if (predAway === actualAway) awayGoals = 2;
  if (predHome - predAway === actualHome - actualAway) goalDifference = 3;

  let firstTeam = 0;
  if (first_team === 'none' && isNoGoalMatch(actualHome, actualAway)) {
    firstTeam = 2;
  } else if (firstTeamMatches(first_team, first_scorer_team, home_team, away_team)) {
    firstTeam = 2;
  }

  let firstPlayer = 0;
  if (isNoScorerPrediction(first_player) && !goalsWereScored(actual, actualHome, actualAway)) {
    firstPlayer = 8;
  } else if (
    !isNoScorerPrediction(first_player) &&
    first_player &&
    first_scorer_player &&
    playersMatch(first_player, first_scorer_player) &&
    firstScorerPlayerPointsEligible(actual)
  ) {
    firstPlayer = 8;
  }

  const scoreSubtotal = outcome + homeGoals + awayGoals + goalDifference + firstTeam + firstPlayer;
  const mult = booster ? boosterMultiplier(stage) : 1;
  const underdog = underdogBonus;
  const afterBooster = (scoreSubtotal + underdog) * mult;

  return {
    outcome,
    homeGoals,
    awayGoals,
    goalDifference,
    firstTeam,
    firstPlayer,
    scoreSubtotal,
    boosterMultiplier: mult,
    afterBooster,
    underdog,
    total: afterBooster,
  };
}

export function computeUnderdogBonus(pred, actual, suggestions) {
  if (!actual || actual.home_score == null || actual.away_score == null) return 0;
  if (pred.home_pred == null || pred.away_pred == null) return 0;

  const predHome = toScore(pred.home_pred);
  const predAway = toScore(pred.away_pred);
  const actualHome = toScore(actual.home_score);
  const actualAway = toScore(actual.away_score);
  if (predHome == null || predAway == null || actualHome == null || actualAway == null) {
    return 0;
  }
  if (predHome !== actualHome || predAway !== actualAway) return 0;
  if (!suggestions?.length) return 0;

  const isPopular = suggestions.some(
    (s) => toScore(s.home) === predHome && toScore(s.away) === predAway
  );
  return isPopular ? 0 : 5;
}

export function formatPointsBreakdown(b) {
  if (!b) return { lines: [], total: 0 };
  const lines = [];
  if (b.outcome) lines.push({ label: 'Исход', points: b.outcome });
  if (b.homeGoals) lines.push({ label: 'Голы хозяев', points: b.homeGoals });
  if (b.awayGoals) lines.push({ label: 'Голы гостей', points: b.awayGoals });
  if (b.goalDifference) lines.push({ label: 'Разница в счёте', points: b.goalDifference });
  if (b.firstTeam) lines.push({ label: 'Команда открыла счёт', points: b.firstTeam });
  if (b.firstPlayer) lines.push({ label: 'Игрок открыл счёт', points: b.firstPlayer });
  if (b.underdog) {
    lines.push({ label: 'Андердог-бонус', points: b.underdog });
  }
  if (b.boosterMultiplier > 1 && (b.scoreSubtotal + b.underdog) > 0) {
    lines.push({
      label: `Бустер ×${b.boosterMultiplier}`,
      points: (b.scoreSubtotal + b.underdog) * (b.boosterMultiplier - 1),
    });
  }
  return { lines, total: b.total };
}
