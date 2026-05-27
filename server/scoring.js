/**
 * Euro-style scoring (used by many WC predictors):
 * - 3 points for exact score
 * - 1 point for correct result (winner or draw)
 * Knockout matches award double points.
 */
function matchPoints(predHome, predAway, actualHome, actualAway, stage) {
  if (actualHome == null || actualAway == null) {
    return 0;
  }

  let points = 0;
  if (predHome === actualHome && predAway === actualAway) {
    points = 3;
  } else {
    const predSign = Math.sign(predHome - predAway);
    const actualSign = Math.sign(actualHome - actualAway);
    if (predSign === actualSign) {
      points = 1;
    }
  }

  const knockoutStages = [
    'round_of_32',
    'round_of_16',
    'quarter_final',
    'semi_final',
    'third_place',
    'final',
  ];
  if (knockoutStages.includes(stage)) {
    points *= 2;
  }

  return points;
}

module.exports = { matchPoints };
