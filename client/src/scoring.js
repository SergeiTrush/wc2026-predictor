/** Client copy of shared/scoring.js — keep in sync with shared/scoring.js */

function boosterMultiplier(stage) {
  if (stage === 'quarter_final') return 3;
  if (stage === 'semi_final') return 4;
  if (stage === 'final') return 5;
  return 2;
}

function outcomeSign(home, away) {
  return Math.sign(home - away);
}

function normalizePlayer(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
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

function firstTeamMatches(predTeam, actualTeam) {
  if (!predTeam || !actualTeam) return false;
  if (predTeam === 'none') {
    return actualTeam === 'none';
  }
  return predTeam === actualTeam;
}

function isNoScorerPrediction(firstPlayer) {
  return firstPlayer === 'none';
}

function isNoGoalMatch(homeScore, awayScore) {
  return homeScore === 0 && awayScore === 0;
}

export function breakdownMatchPoints(pred, actual) {
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
    total: 0,
  };

  if (actual.home_score == null || actual.away_score == null) {
    return empty;
  }

  const { home_pred, away_pred, first_team, first_player, booster } = pred;
  const { home_score, away_score, first_scorer_team, first_scorer_player, stage } = actual;

  let outcome = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let goalDifference = 0;

  if (outcomeSign(home_pred, away_pred) === outcomeSign(home_score, away_score)) {
    outcome = 3;
  }
  if (home_pred === home_score) homeGoals = 2;
  if (away_pred === away_score) awayGoals = 2;
  if (home_pred - away_pred === home_score - away_score) goalDifference = 3;

  let firstTeam = 0;
  if (first_team === 'none' && isNoGoalMatch(home_score, away_score)) {
    firstTeam = 2;
  } else if (firstTeamMatches(first_team, first_scorer_team)) {
    firstTeam = 2;
  }

  let firstPlayer = 0;
  if (isNoScorerPrediction(first_player) && isNoGoalMatch(home_score, away_score)) {
    firstPlayer = 8;
  } else if (first_player && first_scorer_player && playersMatch(first_player, first_scorer_player)) {
    firstPlayer = 8;
  }

  const scoreSubtotal = outcome + homeGoals + awayGoals + goalDifference + firstTeam + firstPlayer;
  const mult = booster ? boosterMultiplier(stage) : 1;
  const afterBooster = scoreSubtotal * mult;

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
    total: afterBooster,
  };
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
  if (b.boosterMultiplier > 1 && b.scoreSubtotal > 0) {
    lines.push({
      label: `Бустер ×${b.boosterMultiplier}`,
      points: b.afterBooster - b.scoreSubtotal,
    });
  }
  return { lines, total: b.total };
}
