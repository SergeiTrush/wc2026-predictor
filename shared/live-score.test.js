const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isLiveExtraTime,
  isKnockoutRegulationFrozen,
  regulationScoreForPoints,
  resolveKnockoutPersistScores,
  repairMisSplitRegulationScores,
  scoringActualFromLive,
} = require('./live-score');

const belgiumSenegal = {
  stage: 'round_of_32',
  home_team: 'Belgium',
  away_team: 'Senegal',
  home_score: 2,
  away_score: 2,
};

const germanyParaguay = {
  stage: 'round_of_32',
  home_team: 'Germany',
  away_team: 'Paraguay',
  home_score: 1,
  away_score: 1,
};

test('repairMisSplitRegulationScores fixes mistaken 0-0 split from final score', () => {
  const repaired = repairMisSplitRegulationScores({
    home_score: 0,
    away_score: 0,
    final_home_score: 2,
    final_away_score: 0,
  });
  assert.deepEqual(repaired, { home: 2, away: 0 });
});

test('repairMisSplitRegulationScores fixes mistaken ET split', () => {
  const repaired = repairMisSplitRegulationScores({
    home_score: 1,
    away_score: 0,
    final_home_score: 3,
    final_away_score: 0,
  });
  assert.deepEqual(repaired, { home: 3, away: 0 });
});

test('repairMisSplitRegulationScores keeps genuine knockout ET regulation draw', () => {
  const repaired = repairMisSplitRegulationScores({
    home_score: 1,
    away_score: 1,
    final_home_score: 2,
    final_away_score: 1,
  });
  assert.deepEqual(repaired, { home: 1, away: 1 });
});

test('isLiveExtraTime is false during second-half stoppage time (minute > 90)', () => {
  assert.equal(isLiveExtraTime({ status: '2nd_half', minute: 98 }), false);
  assert.equal(isLiveExtraTime({ status: 'inprogress', minute: 95 }), false);
});

test('isLiveExtraTime is true only when status is extra time or penalties', () => {
  assert.equal(isLiveExtraTime({ status: 'extra_time', minute: 105 }), true);
  assert.equal(isLiveExtraTime({ status: 'penalties', minute: 120 }), true);
});

test('isKnockoutRegulationFrozen when API status lags but aggregate moved past regulation draw', () => {
  const live = { homeScore: 3, awayScore: 2, status: '2nd_half', minute: 126 };
  assert.equal(isKnockoutRegulationFrozen(belgiumSenegal, live), true);
});

test('isKnockoutRegulationFrozen is false during second-half stoppage time', () => {
  const live = { homeScore: 2, awayScore: 2, status: '2nd_half', minute: 98 };
  assert.equal(isKnockoutRegulationFrozen(belgiumSenegal, live), false);
});

test('regulationScoreForPoints freezes at 2-2 when Belgium scores in ET (API status 2nd_half)', () => {
  const live = { homeScore: 3, awayScore: 2, status: '2nd_half', minute: 126 };
  const reg = regulationScoreForPoints(belgiumSenegal, live);
  assert.deepEqual(reg, { home: 2, away: 2 });
});

test('scoringActualFromLive ignores ET winner for knockout points when API status lags', () => {
  const actual = scoringActualFromLive(belgiumSenegal, {
    homeScore: 3,
    awayScore: 2,
    status: '2nd_half',
    minute: 126,
  });
  assert.equal(actual.home_score, 2);
  assert.equal(actual.away_score, 2);
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

test('resolveKnockoutPersistScores updates live regulation score (not ET split)', () => {
  const match = { stage: 'round_of_32', home_score: 1, away_score: 0 };
  const scores = resolveKnockoutPersistScores(match, 3, 0, false);
  assert.deepEqual(scores, {
    homeScore: 3,
    awayScore: 0,
    finalHomeScore: null,
    finalAwayScore: null,
  });
});

test('resolveKnockoutPersistScores uses aggregate for group stage live updates', () => {
  const match = { stage: 'group', home_score: 1, away_score: 0 };
  const scores = resolveKnockoutPersistScores(match, 3, 0, false);
  assert.deepEqual(scores, {
    homeScore: 3,
    awayScore: 0,
    finalHomeScore: null,
    finalAwayScore: null,
  });
});
