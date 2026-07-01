const { buildScoringActual, scorerSide, toScore } = require('../shared/scoring');
const { scoringActualFromLive, liveScoreIsFinished, isKnockoutRegulationFrozen, repairMisSplitRegulationScores } = require('../shared/live-score');
const { getLocalSquadsBulk } = require('./squad-service');
const {
  resolveFirstScorerForFixture,
  resolveScorerFromCachedIncidents,
  regulationScoreFromCachedIncidents,
} = require('./first-scorer-sync');

function normName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/#\d+/g, '')
    .trim();
}

function sqSurname(s) {
  const parts = s.split(/[\s.\-]+/).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  return last.length <= 2 && parts.length >= 2 ? parts[parts.length - 2] : last;
}

function findPlayerSide(playerName, homeTeam, awayTeam) {
  if (!playerName || playerName === 'none') return null;
  const pn = normName(playerName);
  const ps = sqSurname(pn);
  if (!pn) return null;

  try {
    const bulk = getLocalSquadsBulk();
    if (!bulk?.teams) return null;
    for (const [side, teamName] of [['home', homeTeam], ['away', awayTeam]]) {
      const found = (bulk.teams[teamName] || []).some((p) => {
        const n = normName(p.name || p.surname || '');
        if (!n) return false;
        if (pn.includes(n) || n.includes(pn)) return true;
        const ns = sqSurname(n);
        return ns.length >= 3 && ns === ps;
      });
      if (found) return side;
    }
  } catch {
    /* squad lookup is best-effort */
  }
  return null;
}

function inferFirstScorerMeta(match) {
  const homeTeam = match.home_team;
  const awayTeam = match.away_team;
  const player = match.first_scorer_player;

  let playerTeam = null;
  if (player && player !== 'none') {
    playerTeam = findPlayerSide(player, homeTeam, awayTeam);
    if (!playerTeam) {
      playerTeam = match.first_scorer_player_team || null;
    }
    if (!playerTeam && match.first_scorer_team && match.first_scorer_is_own_goal !== 1) {
      const scorerSideKey = scorerSide(match.first_scorer_team, homeTeam, awayTeam);
      if (scorerSideKey && scorerSideKey !== 'none') {
        playerTeam = scorerSideKey;
      }
    }
  }

  let isOwnGoal = null;
  if (playerTeam && match.first_scorer_team) {
    const scorerSideKey = scorerSide(match.first_scorer_team, homeTeam, awayTeam);
    isOwnGoal =
      scorerSideKey &&
      playerTeam !== 'none' &&
      scorerSideKey !== 'none' &&
      scorerSideKey !== playerTeam
        ? 1
        : 0;
  } else if (match.first_scorer_is_own_goal != null) {
    isOwnGoal = match.first_scorer_is_own_goal;
  }

  return { first_scorer_player_team: playerTeam, first_scorer_is_own_goal: isOwnGoal };
}

function matchRegulationGoals(match, scoreOverrides = {}) {
  const home = toScore(scoreOverrides.home_score ?? match.home_score);
  const away = toScore(scoreOverrides.away_score ?? match.away_score);
  return { home, away, total: (home ?? 0) + (away ?? 0) };
}

function storedRegulationLooksStale(match) {
  const home = toScore(match.home_score);
  const away = toScore(match.away_score);
  if (home == null || away == null) return false;
  if (home !== 0 || away !== 0) return false;
  const finalTotal =
    (toScore(match.final_home_score) ?? 0) + (toScore(match.final_away_score) ?? 0);
  const hasScorer =
    (match.first_scorer_player && match.first_scorer_player !== 'none') ||
    (match.first_scorer_team && match.first_scorer_team !== 'none');
  return finalTotal > 0 || Boolean(hasScorer);
}

async function resolveRegulationScores(match, liveScore = null) {
  const stored = matchRegulationGoals(match);
  if (stored.total > 0) {
    return { home: stored.home, away: stored.away };
  }

  let fromIncidents = regulationScoreFromCachedIncidents(match);
  if (fromIncidents && fromIncidents.home + fromIncidents.away > 0) {
    return fromIncidents;
  }

  if (match.external_fixture_id && (needsScorerHydration(match) || storedRegulationLooksStale(match))) {
    await hydrateMatchScorerFromApi(match, liveScore);
    fromIncidents = regulationScoreFromCachedIncidents(match);
    if (fromIncidents && fromIncidents.home + fromIncidents.away > 0) {
      return fromIncidents;
    }
  }

  if (liveScore && !isKnockoutRegulationFrozen(match, liveScore)) {
    const agg = {
      home: toScore(liveScore.homeScore),
      away: toScore(liveScore.awayScore),
    };
    if (agg.home != null && agg.away != null && agg.home + agg.away > 0) {
      return { home: agg.home, away: agg.away };
    }
  }

  if (storedRegulationLooksStale(match)) {
    const fh = toScore(match.final_home_score);
    const fa = toScore(match.final_away_score);
    if (fh != null && fa != null && fh + fa > 0) {
      return { home: fh, away: fa };
    }
  }

  return { home: stored.home ?? 0, away: stored.away ?? 0 };
}

function applyRegulationScoresToMatch(match, regulation) {
  if (!regulation) return match;
  return {
    ...match,
    home_score: regulation.home,
    away_score: regulation.away,
  };
}

/** Repair stale 0:0 regulation scores synchronously (no API) before scoring. */
function applySyncRegulationRepair(match) {
  const misSplit = repairMisSplitRegulationScores(match);
  if (misSplit && (misSplit.home !== Number(match.home_score) || misSplit.away !== Number(match.away_score))) {
    return applyRegulationScoresToMatch(match, misSplit);
  }

  if (!storedRegulationLooksStale(match)) return match;

  const fromIncidents = regulationScoreFromCachedIncidents(match);
  if (fromIncidents && fromIncidents.home + fromIncidents.away > 0) {
    return applyRegulationScoresToMatch(match, fromIncidents);
  }

  const fh = toScore(match.final_home_score);
  const fa = toScore(match.final_away_score);
  if (fh != null && fa != null && fh + fa > 0) {
    return applyRegulationScoresToMatch(match, { home: fh, away: fa });
  }

  return match;
}

async function repairMatchRegulationScores(match, liveScore = null) {
  if (!storedRegulationLooksStale(match)) return match;
  const regulation = await resolveRegulationScores(match, liveScore);
  if (!regulation || regulation.home + regulation.away <= 0) return match;
  return applyRegulationScoresToMatch(match, regulation);
}

function needsScorerHydration(match, scoreOverrides = {}) {
  const { total } = matchRegulationGoals(match, scoreOverrides);
  if (total <= 0) return false;
  if (!match.first_scorer_player || match.first_scorer_player === 'none') return true;
  if (!match.first_scorer_team || match.first_scorer_team === 'none') return true;
  if (match.first_scorer_player_team == null) return true;
  if (match.first_scorer_is_own_goal == null) return true;
  return false;
}

function mergeScorerFields(match, scorer) {
  if (!scorer) return match;
  const hasData =
    (scorer.team && scorer.team !== 'none') ||
    (scorer.player && scorer.player !== 'none') ||
    scorer.playerTeam != null ||
    scorer.isOwnGoal != null;
  if (!hasData) return match;
  return {
    ...match,
    first_scorer_team: scorer.team ?? match.first_scorer_team,
    first_scorer_player: scorer.player ?? match.first_scorer_player,
    first_scorer_player_team: scorer.playerTeam ?? match.first_scorer_player_team,
    first_scorer_is_own_goal:
      scorer.isOwnGoal != null ? scorer.isOwnGoal : match.first_scorer_is_own_goal,
  };
}

function hydrateScorerFromCache(match) {
  if (!needsScorerHydration(match)) return match;
  const cached = resolveScorerFromCachedIncidents(match);
  if (!cached?.player && !cached?.team) return match;
  return mergeScorerFields(match, {
    team: cached.team,
    player: cached.player,
    playerTeam: cached.playerTeam,
    isOwnGoal: cached.isOwnGoal,
  });
}

function enrichMatchForScoring(match, scoreOverrides = {}) {
  const repaired = applySyncRegulationRepair(match);
  const hydrated = hydrateScorerFromCache(repaired);
  const meta = inferFirstScorerMeta(hydrated);
  return buildScoringActual(
    {
      ...hydrated,
      first_scorer_player_team: meta.first_scorer_player_team ?? hydrated.first_scorer_player_team,
      first_scorer_is_own_goal: meta.first_scorer_is_own_goal ?? hydrated.first_scorer_is_own_goal,
    },
    scoreOverrides
  );
}

async function hydrateMatchScorerFromApi(match, liveScore = null) {
  let hydrated = hydrateScorerFromCache(match);
  if (!needsScorerHydration(hydrated) && !storedRegulationLooksStale(hydrated)) return hydrated;
  if (!match.external_fixture_id) return hydrated;

  const inExtraTime = liveScore && isKnockoutRegulationFrozen(match, liveScore);
  const fixture = {
    externalId: match.external_fixture_id,
    home: match.home_team,
    away: match.away_team,
    homeGoals: liveScore?.homeScore ?? match.final_home_score ?? match.home_score,
    awayGoals: liveScore?.awayScore ?? match.final_away_score ?? match.away_score,
    inExtraTime,
  };

  const scorer = await resolveFirstScorerForFixture(hydrated, fixture, {});
  if (!scorer.fetched) return hydrated;

  return mergeScorerFields(hydrated, {
    team: scorer.firstTeam,
    player: scorer.firstPlayer,
    playerTeam: scorer.playerTeam,
    isOwnGoal: scorer.isOwnGoal,
  });
}

function resolveScoringActual(match, liveScore = null, { matchHasResult, matchHasLiveManualScore } = {}) {
  const hydrated = hydrateScorerFromCache(match);
  const feed = liveScore;

  if (feed && !liveScoreIsFinished(feed)) {
    const display = scoringActualFromLive(hydrated, feed);
    if (display) {
      return enrichMatchForScoring(hydrated, {
        home_score: display.home_score,
        away_score: display.away_score,
      });
    }
  }

  if (matchHasResult?.(hydrated)) {
    return enrichMatchForScoring(hydrated);
  }

  if (feed && liveScoreIsFinished(feed)) {
    const display = scoringActualFromLive(hydrated, feed);
    if (display) {
      return enrichMatchForScoring(hydrated, {
        home_score: display.home_score,
        away_score: display.away_score,
      });
    }
  }

  if (matchHasLiveManualScore?.(hydrated)) {
    return enrichMatchForScoring(hydrated);
  }

  return null;
}

module.exports = {
  findPlayerSide,
  inferFirstScorerMeta,
  needsScorerHydration,
  storedRegulationLooksStale,
  mergeScorerFields,
  hydrateScorerFromCache,
  hydrateMatchScorerFromApi,
  repairMatchRegulationScores,
  enrichMatchForScoring,
  resolveScoringActual,
};
