const test = require('node:test');
const assert = require('node:assert/strict');
const { breakdownMatchPoints, boosterMultiplier } = require('../shared/scoring');

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
  assert.equal(boosterMultiplier('quarter_final'), 3);
  assert.equal(boosterMultiplier('semi_final'), 4);
  assert.equal(boosterMultiplier('final'), 5);
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

test('final with booster caps at 5x on match subtotal', () => {
  const b = breakdownMatchPoints(
    { home_pred: 2, away_pred: 1, booster: 1 },
    { ...baseActual, stage: 'final' }
  );
  assert.equal(b.boosterMultiplier, 5);
  assert.equal(b.afterBooster, 50);
});
