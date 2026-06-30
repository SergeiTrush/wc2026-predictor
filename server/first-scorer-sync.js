const { getLocalSquadsBulk } = require('./squad-service');
const { apiFetch } = require('./bzzoiro-client');
const { storedRegulationScores } = require('../shared/live-score');

const CANONICAL_TEAMS = new Set(['home', 'away', 'none']);

const incidentCache = new Map();
const INCIDENT_CACHE_MS = 90_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isKnockoutMatch(match) {
  return Boolean(match?.stage && match.stage !== 'group');
}

function regulationScoreFromIncidents(incidents, { regulationOnly = true } = {}) {
  if (!Array.isArray(incidents)) return null;
  let home = 0;
  let away = 0;
  for (const incident of incidents) {
    if (incident.type !== 'goal') continue;
    if (regulationOnly && !isRegulationGoal(incident)) continue;
    if (incident.is_home === true) home += 1;
    else if (incident.is_home === false) away += 1;
  }
  return { home, away };
}

function regulationScoreFromCachedIncidents(match) {
  const eventId = match.external_fixture_id;
  if (!eventId) return null;
  const incidents = getCachedIncidents(eventId);
  if (!incidents?.length) return null;
  return regulationScoreFromIncidents(incidents, { regulationOnly: isKnockoutMatch(match) });
}

function normalizeForSquadMatch(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/#\d+/g, '')
    .trim();
}

function squadSurname(normalized) {
  const parts = normalized.split(/[\s.\-]+/).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  return last.length <= 2 && parts.length >= 2 ? parts[parts.length - 2] : last;
}

function inferTeamFromSquads(playerName, homeTeamName, awayTeamName) {
  if (!playerName) return null;
  const bulk = getLocalSquadsBulk();
  if (!bulk?.teams) return null;
  const pNorm = normalizeForSquadMatch(playerName);
  if (!pNorm) return null;
  const pSurname = squadSurname(pNorm);
  for (const [side, teamName] of [
    ['home', homeTeamName],
    ['away', awayTeamName],
  ]) {
    const players = bulk.teams[teamName] || [];
    const found = players.some((p) => {
      const n = normalizeForSquadMatch(p.name || p.surname || '');
      if (!n) return false;
      if (pNorm.includes(n) || n.includes(pNorm)) return true;
      const ns = squadSurname(n);
      return ns.length >= 3 && ns === pSurname;
    });
    if (found) return side;
  }
  return null;
}

/** Stored team key → home/away/none (FirstTeamSelect values). */
function normalizeFirstScorerTeam(team, homeTeam, awayTeam) {
  if (!team || team === 'none') return team || null;
  if (CANONICAL_TEAMS.has(team)) return team;
  if (homeTeam && team === homeTeam) return 'home';
  if (awayTeam && team === awayTeam) return 'away';
  return team;
}

function isOwnGoalIncident(incident) {
  const gt = String(incident?.goal_type || '').toLowerCase().replace(/[\s_-]+/g, '');
  return gt === 'owngoal';
}

function goalEffectiveMinute(incident) {
  return (incident.minute ?? 999) + (incident.added_time ?? 0) / 100;
}

function isRegulationGoal(incident) {
  return goalEffectiveMinute(incident) <= 90;
}

function parseFirstScorer(incidents, homeTeamName, awayTeamName, { regulationOnly = false } = {}) {
  if (!Array.isArray(incidents)) {
    return { team: null, player: null, playerTeam: null, isOwnGoal: null };
  }

  const goals = incidents
    .filter((i) => i.type === 'goal')
    .filter((i) => !regulationOnly || isRegulationGoal(i))
    .map((i) => ({
      minute: goalEffectiveMinute(i),
      isHome: i.is_home,
      player: i.player || null,
      isOwnGoal: isOwnGoalIncident(i),
    }))
    .sort((a, b) => a.minute - b.minute);

  if (!goals.length) return { team: null, player: null, playerTeam: null, isOwnGoal: null };

  const first = goals[0];
  let firstTeam = null;
  if (first.isHome === true) firstTeam = 'home';
  else if (first.isHome === false) firstTeam = 'away';

  let playerTeam = null;
  if (first.player) {
    playerTeam = inferTeamFromSquads(first.player, homeTeamName, awayTeamName);
  }

  if (!firstTeam && first.player) {
    if (first.isOwnGoal && playerTeam) {
      firstTeam = playerTeam === 'home' ? 'away' : 'home';
    } else {
      firstTeam = playerTeam;
    }
  }

  const isOwnGoal =
    first.isOwnGoal ||
    (firstTeam && playerTeam && firstTeam !== playerTeam && playerTeam !== null);

  return {
    team: firstTeam,
    player: first.player,
    playerTeam,
    isOwnGoal: isOwnGoal ? 1 : 0,
  };
}

/** Goal count used to decide whether a first scorer exists (90-min for knockout ET). */
function regulationGoalTotals(match, fixture) {
  const homeGoals = fixture.homeGoals ?? fixture.homeScore;
  const awayGoals = fixture.awayGoals ?? fixture.awayScore;
  if (!isKnockoutMatch(match)) {
    return { home: Number(homeGoals), away: Number(awayGoals) };
  }
  if (fixture.inExtraTime) {
    const stored = storedRegulationScores(match);
    if (stored) return stored;
  }
  return { home: Number(homeGoals), away: Number(awayGoals) };
}

function firstScorerNeedsApiFetch(match, homeGoals, awayGoals) {
  if (homeGoals == null || awayGoals == null) return false;
  if (Number(homeGoals) + Number(awayGoals) === 0) return false;

  const team = match.first_scorer_team;
  const player = match.first_scorer_player;
  const teamCanonical = CANONICAL_TEAMS.has(team);

  if (!player || player === 'none') return true;
  if (!team || team === 'none') return true;
  if (!teamCanonical) return true;
  if (match.first_scorer_player_team == null) return true;
  if (match.first_scorer_is_own_goal == null) return true;

  return false;
}

function getCachedIncidents(eventId) {
  const cached = incidentCache.get(eventId);
  if (cached && Date.now() - cached.at < INCIDENT_CACHE_MS) {
    return cached.incidents;
  }
  return null;
}

async function fetchIncidents(eventId) {
  const cached = getCachedIncidents(eventId);
  if (cached) return cached;
  const data = await apiFetch(`/events/${eventId}/incidents/`);
  const incidents = data.incidents || [];
  incidentCache.set(eventId, { incidents, at: Date.now() });
  return incidents;
}

function scorerFromIncidents(incidents, match, homeTeam, awayTeam) {
  const regulationOnly = isKnockoutMatch(match);
  return parseFirstScorer(incidents, homeTeam, awayTeam, { regulationOnly });
}

/**
 * Resolve first scorer for a match from Bzzoiro incidents (or squad inference).
 * @returns {{ firstTeam, firstPlayer, playerTeam, isOwnGoal, fetched: boolean }}
 */
async function resolveFirstScorerForFixture(match, fixture, { maxEventFetches, eventFetchesRef, errors } = {}) {
  const homeTeam = fixture.home;
  const awayTeam = fixture.away;
  const normalizedTeam = normalizeFirstScorerTeam(match.first_scorer_team, homeTeam, awayTeam);

  const regTotals = regulationGoalTotals(match, fixture);
  const matchForFetch = { ...match, first_scorer_team: normalizedTeam };

  if (!firstScorerNeedsApiFetch(matchForFetch, regTotals.home, regTotals.away)) {
    return {
      firstTeam: null,
      firstPlayer: null,
      playerTeam: null,
      isOwnGoal: null,
      fetched: false,
    };
  }

  if (!CANONICAL_TEAMS.has(normalizedTeam) && match.first_scorer_player) {
    const inferred = inferTeamFromSquads(match.first_scorer_player, homeTeam, awayTeam);
    if (inferred) {
      return {
        firstTeam: inferred,
        firstPlayer: match.first_scorer_player,
        playerTeam: inferred,
        isOwnGoal: null,
        fetched: false,
      };
    }
  }

  if (!fixture.externalId) {
    return { firstTeam: null, firstPlayer: null, playerTeam: null, isOwnGoal: null, fetched: false };
  }

  const cachedIncidents = getCachedIncidents(fixture.externalId);
  const atFetchCap =
    maxEventFetches != null && eventFetchesRef && eventFetchesRef.value >= maxEventFetches;

  if (atFetchCap && !cachedIncidents) {
    return { firstTeam: null, firstPlayer: null, playerTeam: null, isOwnGoal: null, fetched: false };
  }

  try {
    if (!cachedIncidents) {
      await sleep(120);
    }
    const incidents = cachedIncidents || (await fetchIncidents(fixture.externalId));
    if (!cachedIncidents && eventFetchesRef) eventFetchesRef.value += 1;
    const scorer = scorerFromIncidents(incidents, match, homeTeam, awayTeam);
    return {
      firstTeam: scorer.team,
      firstPlayer: scorer.player,
      playerTeam: scorer.playerTeam,
      isOwnGoal: scorer.isOwnGoal,
      fetched: true,
    };
  } catch (err) {
    errors?.push?.(`incidents ${fixture.externalId}: ${err.message}`);
    return { firstTeam: null, firstPlayer: null, playerTeam: null, isOwnGoal: null, fetched: false };
  }
}

/** Sync read from incident cache (no API call). */
function resolveScorerFromCachedIncidents(match) {
  const eventId = match.external_fixture_id;
  if (!eventId) return null;
  const incidents = getCachedIncidents(eventId);
  if (!incidents?.length) return null;
  return scorerFromIncidents(incidents, match, match.home_team, match.away_team);
}

module.exports = {
  CANONICAL_TEAMS,
  normalizeFirstScorerTeam,
  inferTeamFromSquads,
  parseFirstScorer,
  regulationGoalTotals,
  firstScorerNeedsApiFetch,
  getCachedIncidents,
  fetchIncidents,
  regulationScoreFromIncidents,
  regulationScoreFromCachedIncidents,
  resolveScorerFromCachedIncidents,
  resolveFirstScorerForFixture,
};
