const test = require('node:test');
const assert = require('node:assert/strict');
const { enrichMatchForScoring } = require('./scoring-actual');
const { breakdownMatchPoints } = require('../shared/scoring');

test('enrichMatchForScoring includes home, away, and first player points for exact score', () => {
  const actual = enrichMatchForScoring({
    stage: 'round_of_16',
    home_team: 'Netherlands',
    away_team: 'Morocco',
    home_score: 2,
    away_score: 0,
    first_scorer_team: 'home',
    first_scorer_player: 'Cody Gakpo',
    first_scorer_player_team: 'home',
    first_scorer_is_own_goal: 0,
  });

  const breakdown = breakdownMatchPoints(
    {
      home_pred: 2,
      away_pred: 0,
      first_team: 'home',
      first_player: 'Cody Gakpo',
      booster: 0,
    },
    actual
  );

  assert.equal(breakdown.homeGoals, 2);
  assert.equal(breakdown.awayGoals, 2);
  assert.equal(breakdown.firstPlayer, 8);
  assert.equal(breakdown.firstTeam, 2);
  assert.equal(breakdown.scoreSubtotal, 20);
});

test('normalizePredictionForScoring fixes string prediction scores for home and away goals', () => {
  const actual = enrichMatchForScoring({
    stage: 'group',
    home_team: 'Netherlands',
    away_team: 'Morocco',
    home_score: 2,
    away_score: 0,
    first_scorer_team: 'home',
    first_scorer_player: 'Gakpo',
    first_scorer_player_team: 'home',
    first_scorer_is_own_goal: 0,
  });

  const breakdown = breakdownMatchPoints(
    {
      home_pred: '2',
      away_pred: '0',
      first_team: 'home',
      first_player: 'Cody Gakpo',
      booster: 0,
    },
    actual
  );

  assert.equal(breakdown.homeGoals, 2);
  assert.equal(breakdown.awayGoals, 2);
  assert.equal(breakdown.firstPlayer, 8);
});

test('repairMatchRegulationScores fixes stale 0:0 when final score exists', async () => {
  const { repairMatchRegulationScores } = require('./scoring-actual');
  const repaired = await repairMatchRegulationScores({
    id: 75,
    stage: 'round_of_32',
    home_team: 'Netherlands',
    away_team: 'Morocco',
    home_score: 0,
    away_score: 0,
    final_home_score: 1,
    final_away_score: 1,
    first_scorer_team: 'home',
    first_scorer_player: 'C. Gakpo',
    first_scorer_player_team: 'home',
    first_scorer_is_own_goal: 0,
  });
  assert.equal(repaired.home_score, 1);
  assert.equal(repaired.away_score, 1);
});

test('sync regulation repair enables underdog bonus for stale 0:0 scores', () => {
  const { enrichMatchForScoring } = require('./scoring-actual');
  const { breakdownMatchPoints, computeUnderdogBonus } = require('../shared/scoring');
  const { getSuggestionsForMatch } = require('./fifa-score-suggestions');
  const fs = require('fs');
  const byKey =
    JSON.parse(fs.readFileSync(require('path').join(__dirname, 'data/fifa-score-suggestions.json'), 'utf8'))
      .byKey ||
    JSON.parse(fs.readFileSync(require('path').join(__dirname, 'data/fifa-score-suggestions.json'), 'utf8'));

  const match = {
    id: 75,
    stage: 'round_of_32',
    home_team: 'Netherlands',
    away_team: 'Morocco',
    match_label: 'R32 M3',
    bracket_slot_id: 'R32-M3',
    home_score: 0,
    away_score: 0,
    final_home_score: 1,
    final_away_score: 1,
    first_scorer_team: 'home',
    first_scorer_player: 'C. Gakpo',
    first_scorer_player_team: 'home',
    first_scorer_is_own_goal: 0,
  };

  const actual = enrichMatchForScoring(match);
  assert.equal(actual.home_score, 1);
  assert.equal(actual.away_score, 1);

  const pred = { home_pred: 1, away_pred: 1, first_team: 'home', first_player: 'Gakpo', booster: 0 };
  const suggestions = getSuggestionsForMatch(match, byKey);
  const underdogBonus = computeUnderdogBonus(pred, actual, suggestions);
  const breakdown = breakdownMatchPoints(pred, actual, { underdogBonus });

  assert.equal(underdogBonus, 5);
  assert.equal(breakdown.underdog, 5);
  assert.equal(breakdown.total, 25);
});
