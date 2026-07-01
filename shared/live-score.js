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
  const status = String(liveScore.status || '').toLowerCase();
  return status === 'extra_time' || status === 'extratime' || status === 'penalties';
}

/** Stoppage time rarely exceeds ~100'; cumulative minute past that implies ET. */
const KNOCKOUT_ET_MINUTE_THRESHOLD = 101;

function knockoutHasFinalSplit(match) {
  if (match?.final_home_score == null || match?.final_away_score == null) return false;
  const stored = storedRegulationScores(match);
  if (!stored) return false;
  const fh = Number(match.final_home_score);
  const fa = Number(match.final_away_score);
  return fh !== stored.home || fa !== stored.away;
}

/** Regulation ended in a draw but live aggregate moved — ET goal(s) with a lagging API status. */
function knockoutAggregateAheadOfRegulationDraw(match, liveScore) {
  const minute = liveScore?.minute != null ? Number(liveScore.minute) : null;
  if (minute != null && minute < KNOCKOUT_ET_MINUTE_THRESHOLD) return false;
  const stored = storedRegulationScores(match);
  const agg = liveBarDisplayScore(match, liveScore);
  if (!stored || !agg) return false;
  return (
    stored.home === stored.away &&
    (Number(agg.home) !== stored.home || Number(agg.away) !== stored.away)
  );
}

/** Knockout match where fantasy points must use frozen 90-minute score, not ET aggregate. */
function isKnockoutRegulationFrozen(match, liveScore) {
  if (!isKnockoutMatch(match) || !liveScore) return false;
  if (isLiveExtraTime(liveScore)) return true;
  if (knockoutHasFinalSplit(match)) return true;
  if (knockoutAggregateAheadOfRegulationDraw(match, liveScore)) return true;
  const minute = liveScore.minute;
  if (minute != null && Number(minute) >= KNOCKOUT_ET_MINUTE_THRESHOLD) return true;
  return false;
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

/** Repair mistaken ET split where regulation wasn't a draw but final aggregate differs. */
function repairMisSplitRegulationScores(match) {
  const stored = storedRegulationScores(match);
  if (!stored) return null;
  const fh = match.final_home_score != null ? Number(match.final_home_score) : null;
  const fa = match.final_away_score != null ? Number(match.final_away_score) : null;
  if (fh == null || fa == null || Number.isNaN(fh) || Number.isNaN(fa)) return stored;
  // Genuine knockout ET regulation draw (e.g. 1-1 → 2-1), not a mistaken 0-0 split.
  if (stored.home === stored.away && stored.home > 0) return stored;
  if (stored.home !== fh || stored.away !== fa) {
    return { home: fh, away: fa };
  }
  return stored;
}

/** Current aggregate on the live bar (includes extra-time goals). */
function liveBarDisplayScore(match, liveScore) {
  if (!liveScore || liveScore.homeScore == null || liveScore.awayScore == null) return null;
  return { home: liveScore.homeScore, away: liveScore.awayScore };
}

/** 90-minute score for fantasy points (knockout ET / penalties use frozen regulation). */
function regulationScoreForPoints(match, liveScore) {
  if (!liveScore) return null;
  if (isKnockoutRegulationFrozen(match, liveScore)) {
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
  if (!isKnockoutMatch(match)) {
    return {
      homeScore: aggregateHome,
      awayScore: aggregateAway,
      finalHomeScore: null,
      finalAwayScore: null,
    };
  }

  const stored = storedRegulationScores(match);
  if (inExtraTime && stored) {
    return {
      homeScore: stored.home,
      awayScore: stored.away,
      finalHomeScore: aggregateHome,
      finalAwayScore: aggregateAway,
    };
  }
  if (
    stored &&
    stored.home === 0 &&
    stored.away === 0 &&
    Number(aggregateHome) + Number(aggregateAway) > 0 &&
    !inExtraTime
  ) {
    return {
      homeScore: aggregateHome,
      awayScore: aggregateAway,
      finalHomeScore: null,
      finalAwayScore: null,
    };
  }
  // Knockout ended after ET: regulation was a draw, final aggregate differs.
  if (
    stored &&
    !inExtraTime &&
    stored.home === stored.away &&
    (stored.home !== aggregateHome || stored.away !== aggregateAway)
  ) {
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
  if (isKnockoutRegulationFrozen(match, live)) {
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
    home_score: Number(display.home),
    away_score: Number(display.away),
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
  return isKnockoutRegulationFrozen(match, liveScore);
}

module.exports = {
  liveScoreIsFinished,
  isKnockoutMatch,
  isLiveExtraTime,
  isKnockoutRegulationFrozen,
  isKnockoutExtraTime,
  storedRegulationScores,
  repairMisSplitRegulationScores,
  regulationScoresFromLive,
  liveBarDisplayScore,
  regulationScoreForPoints,
  resolveKnockoutPersistScores,
  attachRegulationToLiveCache,
  liveDisplayScore,
  scoringActualFromLive,
};
