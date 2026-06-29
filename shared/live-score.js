/** Knockout live score helpers — regulation time (90 min) vs current aggregate. */

const FINISHED_STATUSES = new Set(['finished', 'ended', 'ft', 'fulltime', 'full_time']);

function liveScoreIsFinished(liveScore) {
  if (!liveScore) return false;
  const status = String(liveScore.status || '').toLowerCase();
  return FINISHED_STATUSES.has(status);
}

function isKnockoutMatch(match) {
  if (!match) return false;
  if (match.stage && match.stage !== 'group') return true;
  return false;
}

function isLiveExtraTime(liveScore) {
  if (!liveScore) return false;
  const status = liveScore.status;
  if (status === 'extra_time' || status === 'extratime' || status === 'penalties') return true;
  return liveScore.minute != null && liveScore.minute > 90;
}

function regulationScoresFromLive(liveScore) {
  if (!liveScore) return null;
  if (liveScore.regulationHomeScore != null && liveScore.regulationAwayScore != null) {
    return { home: liveScore.regulationHomeScore, away: liveScore.regulationAwayScore };
  }
  return null;
}

function storedRegulationScores(match) {
  if (!match) return null;
  if (match.home_score != null && match.away_score != null) {
    return { home: Number(match.home_score), away: Number(match.away_score) };
  }
  return null;
}

/** Current aggregate on the live bar (includes extra-time goals). */
function liveBarDisplayScore(match, liveScore) {
  if (!liveScore || liveScore.homeScore == null || liveScore.awayScore == null) return null;
  return { home: liveScore.homeScore, away: liveScore.awayScore };
}

/** 90-minute score for fantasy points (knockout ET / penalties use frozen regulation). */
function regulationScoreForPoints(match, liveScore) {
  if (!liveScore) return null;
  if (isKnockoutMatch(match) && isLiveExtraTime(liveScore)) {
    const reg = regulationScoresFromLive(liveScore) ?? storedRegulationScores(match);
    if (reg) return reg;
  }
  return liveBarDisplayScore(match, liveScore);
}

/**
 * Split API aggregate into regulation (90 min) vs final (after ET) for DB persistence.
 * Knockout matches in extra time / penalties keep home_score frozen at regulation.
 */
function resolveKnockoutPersistScores(match, aggregateHome, aggregateAway, inExtraTime) {
  const stored = storedRegulationScores(match);
  if (inExtraTime && stored) {
    return {
      homeScore: stored.home,
      awayScore: stored.away,
      finalHomeScore: aggregateHome,
      finalAwayScore: aggregateAway,
    };
  }
  if (stored && (stored.home !== aggregateHome || stored.away !== aggregateAway)) {
    return {
      homeScore: stored.home,
      awayScore: stored.away,
      finalHomeScore: aggregateHome,
      finalAwayScore: aggregateAway,
    };
  }
  return {
    homeScore: aggregateHome,
    awayScore: aggregateAway,
    finalHomeScore: null,
    finalAwayScore: null,
  };
}

function attachRegulationToLiveCache(match, live) {
  const aggregate = liveBarDisplayScore(match, live);
  if (!aggregate) return live;
  if (isKnockoutMatch(match) && isLiveExtraTime(live)) {
    const reg = regulationScoresFromLive(live) ?? storedRegulationScores(match);
    if (reg) {
      return {
        ...live,
        regulationHomeScore: reg.home,
        regulationAwayScore: reg.away,
      };
    }
  }
  return {
    ...live,
    regulationHomeScore: aggregate.home,
    regulationAwayScore: aggregate.away,
  };
}

function scoringActualFromLive(match, liveScore) {
  const display = regulationScoreForPoints(match, liveScore);
  if (!display) return null;
  return {
    home_score: display.home,
    away_score: display.away,
    first_scorer_team: match.first_scorer_team ?? null,
    first_scorer_player: match.first_scorer_player ?? null,
    first_scorer_player_team: match.first_scorer_player_team ?? null,
    first_scorer_is_own_goal: match.first_scorer_is_own_goal ?? null,
    home_team: match.home_team,
    away_team: match.away_team,
    stage: match.stage,
  };
}

/** @deprecated use regulationScoreForPoints or liveBarDisplayScore */
function liveDisplayScore(match, liveScore) {
  return regulationScoreForPoints(match, liveScore);
}

function isKnockoutExtraTime(match, liveScore) {
  return isKnockoutMatch(match) && isLiveExtraTime(liveScore);
}

module.exports = {
  liveScoreIsFinished,
  isKnockoutMatch,
  isLiveExtraTime,
  isKnockoutExtraTime,
  storedRegulationScores,
  regulationScoresFromLive,
  liveBarDisplayScore,
  regulationScoreForPoints,
  resolveKnockoutPersistScores,
  attachRegulationToLiveCache,
  liveDisplayScore,
  scoringActualFromLive,
};
