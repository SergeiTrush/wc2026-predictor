const test = require('node:test');
const assert = require('node:assert/strict');
const { breakdownMatchPoints, boosterMultiplier, computeUnderdogBonus } = require('../shared/scoring');

const baseActual = {
  home_score: 2,
  away_score: 1,
  first_scorer_team: 'home',
  first_scorer_player: 'Mbappé',
  stage: 'group',
};

test('booster multipliers by stage', () => {
  assert.equal(boosterMultiplier('group'), 2);
  assert.equal(boosterMultiplier('round_of_32'), 2);
  assert.equal(boosterMultiplier('round_of_16'), 2);
  assert.equal(boosterMultiplier('quarter_final'), 2);
  assert.equal(boosterMultiplier('semi_final'), 3);
  assert.equal(boosterMultiplier('third_place'), 3);
  assert.equal(boosterMultiplier('final'), 3);
});

test('exact score 2-1 without extras = 10 points', () => {
  const b = breakdownMatchPoints(
    { home_pred: 2, away_pred: 1, booster: 0 },
    baseActual
  );
  assert.equal(b.outcome, 3);
  assert.equal(b.homeGoals, 2);
  assert.equal(b.awayGoals, 2);
  assert.equal(b.goalDifference, 3);
  assert.equal(b.scoreSubtotal, 10);
  assert.equal(b.total, 10);
});

test('home and away goal points when prediction and actual use mixed types', () => {
  const b = breakdownMatchPoints(
    { home_pred: 2, away_pred: 0, booster: 0 },
    {
      home_score: '2',
      away_score: '0',
      first_scorer_team: 'home',
      first_scorer_player: null,
      stage: 'round_of_16',
    }
  );
  assert.equal(b.homeGoals, 2);
  assert.equal(b.awayGoals, 2);
  assert.equal(b.outcome, 3);
  assert.equal(b.goalDifference, 3);
  assert.equal(b.scoreSubtotal, 10);
});

test('exact score + first team + player = 20, x2 booster = 40', () => {
  const b = breakdownMatchPoints(
    {
      home_pred: 2,
      away_pred: 1,
      first_team: 'home',
      first_player: 'Mbappé',
      booster: 1,
    },
    baseActual
  );
  assert.equal(b.scoreSubtotal, 20);
  assert.equal(b.boosterMultiplier, 2);
  assert.equal(b.afterBooster, 40);
  assert.equal(b.total, 40);
});

test('correct outcome only (pred 1-0, actual 3-2) = 6 points (outcome + diff)', () => {
  const b = breakdownMatchPoints(
    { home_pred: 1, away_pred: 0, booster: 0 },
    { ...baseActual, home_score: 3, away_score: 2 }
  );
  assert.equal(b.outcome, 3);
  assert.equal(b.homeGoals, 0);
  assert.equal(b.awayGoals, 0);
  assert.equal(b.goalDifference, 3);
  assert.equal(b.total, 6);
});

test('first player matches by surname when API uses full name', () => {
  const b = breakdownMatchPoints(
    {
      home_pred: 2,
      away_pred: 1,
      first_team: 'home',
      first_player: 'Lozano',
      booster: 0,
    },
    { ...baseActual, first_scorer_player: 'C. Lozano' }
  );
  assert.equal(b.firstPlayer, 8);
});

test('first player "none" on 0-0 match = 8 points', () => {
  const b = breakdownMatchPoints(
    {
      home_pred: 0,
      away_pred: 0,
      first_player: 'none',
      booster: 0,
    },
    {
      home_score: 0,
      away_score: 0,
      first_scorer_team: null,
      first_scorer_player: null,
      stage: 'group',
    }
  );
  assert.equal(b.firstPlayer, 8);
  assert.equal(b.total, 18);
});

test('first player "none" on non 0-0 match = 0 player points', () => {
  const b = breakdownMatchPoints(
    {
      home_pred: 1,
      away_pred: 0,
      first_player: 'none',
      booster: 0,
    },
    baseActual
  );
  assert.equal(b.firstPlayer, 0);
});

test('final with booster uses 3x on match subtotal', () => {
  const b = breakdownMatchPoints(
    { home_pred: 2, away_pred: 1, booster: 1 },
    { ...baseActual, stage: 'final' }
  );
  assert.equal(b.boosterMultiplier, 3);
  assert.equal(b.scoreSubtotal, 10);
  assert.equal(b.afterBooster, 30);
});

test('underdog bonus when exact score is not in FIFA quick-picks', () => {
  const suggestions = [
    { home: 2, away: 0, score: '2-0' },
    { home: 2, away: 1, score: '2-1' },
    { home: 3, away: 1, score: '3-1' },
  ];
  const pred = { home_pred: 1, away_pred: 1 };
  const actual = { home_score: 1, away_score: 1 };
  assert.equal(computeUnderdogBonus(pred, actual, suggestions), 5);
  assert.equal(computeUnderdogBonus({ home_pred: 2, away_pred: 0 }, actual, suggestions), 0);
  assert.equal(computeUnderdogBonus(pred, { home_score: 0, away_score: 0 }, suggestions), 0);
});

test('underdog bonus with string prediction scores', () => {
  const suggestions = [{ home: 2, away: 0, score: '2-0' }];
  assert.equal(
    computeUnderdogBonus(
      { home_pred: '1', away_pred: '1' },
      { home_score: 1, away_score: 1 },
      suggestions
    ),
    5
  );
  assert.equal(
    computeUnderdogBonus(
      { home_pred: '2', away_pred: '0' },
      { home_score: 2, away_score: 0 },
      suggestions
    ),
    0
  );
});

test('underdog bonus is included in breakdown total and booster', () => {
  const b = breakdownMatchPoints(
    { home_pred: 1, away_pred: 1, booster: 1 },
    { home_score: 1, away_score: 1, stage: 'round_of_32' },
    { underdogBonus: 5 }
  );
  assert.equal(b.underdog, 5);
  assert.equal(b.afterBooster, 30);
  assert.equal(b.total, 30);
});
