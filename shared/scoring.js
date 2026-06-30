/**
 * World Cup 2026 match scoring rules.
 * Points are additive per category; booster multiplies match subtotal.
 */

function boosterMultiplier(stage) {
  if (stage === 'semi_final' || stage === 'third_place' || stage === 'final') return 3;
  return 2;
}

function matchdayFromKickoff(kickoff) {
  return kickoff.slice(0, 10);
}

/** Coerce DB/API score values to integers for consistent comparisons. */
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

/** Canonical home/away from stored team key or country name. */
function scorerSide(teamKey, homeTeam, awayTeam) {
  if (!teamKey || teamKey === 'none') return teamKey;
  if (teamKey === 'home' || teamKey === 'away') return teamKey;
  if (homeTeam && teamKey === homeTeam) return 'home';
  if (awayTeam && teamKey === awayTeam) return 'away';
  return null;
}

/** First goal credited to team A but scored by a player from team B (own goal). */
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

/** Merge match metadata needed for first-scorer / own-goal scoring rules. */
function buildScoringActual(match, scoreOverrides = {}) {
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

/** +8 for first player only when result credits the same team/country for both fields. */
function firstScorerPlayerSameTeam(actual) {
  const homeTeam = actual.home_team;
  const awayTeam = actual.away_team;

  const scorerSideKey = scorerSide(actual.first_scorer_team, homeTeam, awayTeam);
  if (!scorerSideKey || scorerSideKey === 'none') return false;

  let playerSideKey = scorerSide(actual.first_scorer_player_team, homeTeam, awayTeam);
  if ((!playerSideKey || playerSideKey === 'none') && actual.first_scorer_player) {
    if (isFirstScorerOwnGoal(actual)) return false;
    // Squad/API often omit player_team; credited scorer side is enough when not an own goal.
    playerSideKey = scorerSideKey;
  }
  if (!playerSideKey || playerSideKey === 'none') return false;
  return scorerSideKey === playerSideKey;
}

function firstScorerPlayerPointsEligible(actual) {
  if (!actual.first_scorer_player || actual.first_scorer_player === 'none') return false;
  if (isNoGoalMatch(actual.home_score, actual.away_score)) return false;
  return firstScorerPlayerSameTeam(actual);
}

/**
 * @returns {object} Line-by-line breakdown for one prediction vs actual result.
 * @param {object} [opts]
 * @param {number} [opts.underdogBonus=0] Extra +5 if this exact score was predicted by <10% of league members.
 */
function breakdownMatchPoints(pred, actual, { underdogBonus = 0 } = {}) {
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
    maxPossible: 20,
  };

  if (actual.home_score == null || actual.away_score == null) {
    return empty;
  }

  const { home_pred, away_pred, first_team, first_player, booster } = pred;
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
  if (isNoScorerPrediction(first_player) && isNoGoalMatch(actualHome, actualAway)) {
    firstPlayer = 8;
  } else if (
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
  const total = afterBooster;

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
    total,
    maxPossible: 10 * mult,
  };
}

function scorelinePoints(pred, actual) {
  return breakdownMatchPoints(pred, actual).afterBooster;
}

function totalMatchPoints(pred, actual) {
  return breakdownMatchPoints(pred, actual).total;
}

function isPredictionResultCorrect(pred, actual) {
  if (!actual || actual.home_score == null || actual.away_score == null) return false;
  const { home_pred, away_pred } = pred;
  if (home_pred == null || away_pred == null) return false;
  return toScore(home_pred) === toScore(actual.home_score) && toScore(away_pred) === toScore(actual.away_score);
}

/** Per-match tiebreak signals for leaderboard ordering (0 or 1 each). */
function leaderboardTiebreakCounts(pred, actual) {
  if (!actual || actual.home_score == null || actual.away_score == null) {
    return { correctResults: 0, correctFirstTeam: 0, correctFirstPlayer: 0 };
  }
  const breakdown = breakdownMatchPoints(pred, actual);
  return {
    correctResults: isPredictionResultCorrect(pred, actual) ? 1 : 0,
    correctFirstTeam: breakdown.firstTeam > 0 ? 1 : 0,
    correctFirstPlayer: breakdown.firstPlayer > 0 ? 1 : 0,
  };
}

function compareLeaderboardRows(a, b) {
  return (
    b.points - a.points ||
    b.correctResults - a.correctResults ||
    b.correctFirstTeam - a.correctFirstTeam ||
    b.correctFirstPlayer - a.correctFirstPlayer ||
    String(a.name).localeCompare(String(b.name))
  );
}

/** Human-readable lines for UI tooltip. */
function formatPointsBreakdown(b) {
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
      note: `${b.scoreSubtotal + b.underdog} × ${b.boosterMultiplier}`,
    });
  }
  return { lines, total: b.total };
}

module.exports = {
  boosterMultiplier,
  matchdayFromKickoff,
  toScore,
  normalizePlayer,
  playerSurname,
  playersMatch,
  scorerSide,
  isFirstScorerOwnGoal,
  firstScorerPlayerSameTeam,
  buildScoringActual,
  firstScorerPlayerPointsEligible,
  breakdownMatchPoints,
  formatPointsBreakdown,
  scorelinePoints,
  totalMatchPoints,
  matchPoints: scorelinePoints,
  isPredictionResultCorrect,
  leaderboardTiebreakCounts,
  compareLeaderboardRows,
};
