const test = require('node:test');
const assert = require('node:assert/strict');
const { breakdownMatchPoints } = require('./scoring');
const { enrichMatchForScoring } = require('../server/scoring-actual');

test('none first player gets +8 only on 0-0 with no goals scored', () => {
  const actual = {
    stage: 'group',
    home_team: 'Mexico',
    away_team: 'Ecuador',
    home_score: 0,
    away_score: 0,
    first_scorer_team: 'none',
    first_scorer_player: 'none',
  };
  const pred = { home_pred: 0, away_pred: 0, first_team: 'none', first_player: 'none', booster: 0 };
  const b = breakdownMatchPoints(pred, actual);
  assert.equal(b.firstPlayer, 8);
  assert.equal(b.firstTeam, 2);
});

test('none first player gets 0 when goals were scored', () => {
  const actual = {
    stage: 'group',
    home_team: 'Mexico',
    away_team: 'Ecuador',
    home_score: 2,
    away_score: 0,
    first_scorer_team: 'home',
    first_scorer_player: 'Some Player',
    first_scorer_player_team: 'home',
    first_scorer_is_own_goal: 0,
  };
  const pred = { home_pred: 1, away_pred: 1, first_team: 'home', first_player: 'none', booster: 0 };
  const b = breakdownMatchPoints(pred, actual);
  assert.equal(b.firstPlayer, 0);
  assert.equal(b.firstTeam, 2);
});

test('none first player gets 0 when scores are stale 0-0 but team scorer is known', () => {
  const actual = enrichMatchForScoring({
    stage: 'group',
    home_team: 'Mexico',
    away_team: 'Ecuador',
    home_score: 0,
    away_score: 0,
    first_scorer_team: 'home',
    first_scorer_player: null,
  });
  const pred = { home_pred: 1, away_pred: 1, first_team: 'home', first_player: 'none', booster: 0 };
  const b = breakdownMatchPoints(pred, actual);
  assert.equal(b.firstPlayer, 0);
  assert.equal(b.firstTeam, 2);
});
