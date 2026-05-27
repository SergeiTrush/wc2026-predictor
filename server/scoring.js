function boosterMultiplier(stage) {
  if (stage === 'quarter_final') return 3;
  if (stage === 'semi_final') return 4;
  if (stage === 'final') return 5;
  return 2;
}

function matchdayFromKickoff(kickoff) {
  return kickoff.slice(0, 10);
}

/**
 * Euro-style scoreline points (per screenshots).
 */
function scorelinePoints(pred, actual) {
  if (actual.home_score == null || actual.away_score == null) return 0;

  let pts = 0;
  const { home_pred, away_pred, first_team, first_player, booster } = pred;
  const { home_score, away_score, first_scorer_team, first_scorer_player, stage } = actual;

  if (Math.sign(home_pred - away_pred) === Math.sign(home_score - away_score)) {
    pts += 3;
  }
  if (home_pred === home_score) pts += 2;
  if (away_pred === away_score) pts += 2;
  if (home_pred - away_pred === home_score - away_score) pts += 3;

  if (first_team && first_scorer_team && first_team === first_scorer_team) {
    pts += 2;
  }
  if (
    first_player &&
    first_scorer_player &&
    first_player.trim().toLowerCase() === first_scorer_player.trim().toLowerCase()
  ) {
    pts += 8;
  }

  if (booster) {
    pts *= boosterMultiplier(stage);
  }

  return pts;
}

function underdogBonus(predHome, predAway, leaguePredictions) {
  if (!leaguePredictions.length) return 0;
  const same = leaguePredictions.filter(
    (p) => p.home_pred === predHome && p.away_pred === predAway
  ).length;
  const share = same / leaguePredictions.length;
  return share < 0.1 && leaguePredictions.length >= 3 ? 5 : 0;
}

function totalMatchPoints(pred, actual, leaguePredictions) {
  return (
    scorelinePoints(pred, actual) +
    underdogBonus(pred.home_pred, pred.away_pred, leaguePredictions)
  );
}

module.exports = {
  boosterMultiplier,
  matchdayFromKickoff,
  scorelinePoints,
  underdogBonus,
  totalMatchPoints,
  matchPoints: scorelinePoints,
};
