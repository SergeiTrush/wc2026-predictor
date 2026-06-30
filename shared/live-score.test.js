const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isLiveExtraTime,
  regulationScoreForPoints,
  resolveKnockoutPersistScores,
  scoringActualFromLive,
} = require('./live-score');

const germanyParaguay = {
  stage: 'round_of_32',
  home_team: 'Germany',
  away_team: 'Paraguay',
  home_score: 1,
  away_score: 1,
};

test('isLiveExtraTime is false during second-half stoppage time (minute > 90)', () => {
  assert.equal(isLiveExtraTime({ status: '2nd_half', minute: 98 }), false);
  assert.equal(isLiveExtraTime({ status: 'inprogress', minute: 95 }), false);
});

test('isLiveExtraTime is true only when status is extra time or penalties', () => {
  assert.equal(isLiveExtraTime({ status: 'extra_time', minute: 105 }), true);
  assert.equal(isLiveExtraTime({ status: 'penalties', minute: 120 }), true);
});

test('regulationScoreForPoints uses live score during stoppage time', () => {
  const live = { homeScore: 1, awayScore: 2, status: '2nd_half', minute: 98 };
  const reg = regulationScoreForPoints(germanyParaguay, live);
  assert.deepEqual(reg, { home: 1, away: 2 });
});

test('regulationScoreForPoints uses stored 90-min score during knockout ET', () => {
  const live = {
    homeScore: 2,
    awayScore: 1,
    status: 'extra_time',
    minute: 105,
  };
  const reg = regulationScoreForPoints(germanyParaguay, live);
  assert.deepEqual(reg, { home: 1, away: 1 });
});

test('scoringActualFromLive excludes ET goals for knockout points', () => {
  const actual = scoringActualFromLive(germanyParaguay, {
    homeScore: 2,
    awayScore: 1,
    status: 'extra_time',
    minute: 105,
  });
  assert.equal(actual.home_score, 1);
  assert.equal(actual.away_score, 1);
});

test('resolveKnockoutPersistScores keeps regulation in home_score during ET', () => {
  const scores = resolveKnockoutPersistScores(germanyParaguay, 2, 1, true);
  assert.deepEqual(scores, {
    homeScore: 1,
    awayScore: 1,
    finalHomeScore: 2,
    finalAwayScore: 1,
  });
});

test('resolveKnockoutPersistScores splits regulation and final when match ends after ET', () => {
  const scores = resolveKnockoutPersistScores(germanyParaguay, 2, 1, false);
  assert.deepEqual(scores, {
    homeScore: 1,
    awayScore: 1,
    finalHomeScore: 2,
    finalAwayScore: 1,
  });
});

test('resolveKnockoutPersistScores uses aggregate when knockout ends in 90 minutes', () => {
  const match = { stage: 'round_of_32', home_score: 2, away_score: 0 };
  const scores = resolveKnockoutPersistScores(match, 2, 0, false);
  assert.deepEqual(scores, {
    homeScore: 2,
    awayScore: 0,
    finalHomeScore: null,
    finalAwayScore: null,
  });
});
