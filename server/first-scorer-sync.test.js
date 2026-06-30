const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFirstScorer, regulationGoalTotals } = require('./first-scorer-sync');

const incidents = [
  { type: 'goal', minute: 23, added_time: 0, is_home: true, player: 'Cody Gakpo' },
  { type: 'goal', minute: 78, added_time: 0, is_home: false, player: 'Hakimi' },
  { type: 'goal', minute: 103, added_time: 0, is_home: false, player: 'En-Nesyri' },
];

test('parseFirstScorer ignores extra-time goals for knockout regulation', () => {
  const scorer = parseFirstScorer(incidents, 'Netherlands', 'Morocco', { regulationOnly: true });
  assert.equal(scorer.player, 'Cody Gakpo');
  assert.equal(scorer.team, 'home');
});

test('parseFirstScorer includes extra-time goals when regulationOnly is false', () => {
  const scorer = parseFirstScorer(incidents, 'Netherlands', 'Morocco', { regulationOnly: false });
  assert.equal(scorer.player, 'Cody Gakpo');
});

test('regulationGoalTotals uses stored 90-min score during knockout ET', () => {
  const totals = regulationGoalTotals(
    { stage: 'round_of_16', home_score: 1, away_score: 1 },
    { homeGoals: 1, awayGoals: 2, inExtraTime: true }
  );
  assert.deepEqual(totals, { home: 1, away: 1 });
});
