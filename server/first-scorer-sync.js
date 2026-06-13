const { getLocalSquadsBulk } = require('./squad-service');
const { apiFetch } = require('./bzzoiro-client');

const CANONICAL_TEAMS = new Set(['home', 'away', 'none']);

const incidentCache = new Map();
const INCIDENT_CACHE_MS = 90_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function parseFirstScorer(incidents, homeTeamName, awayTeamName) {
  if (!Array.isArray(incidents)) {
    return { team: null, player: null, playerTeam: null, isOwnGoal: null };
  }

  const goals = incidents
    .filter((i) => i.type === 'goal')
    .map((i) => ({
      minute: (i.minute ?? 999) + (i.added_time ?? 0) / 100,
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

async function fetchIncidents(eventId) {
  const cached = incidentCache.get(eventId);
  if (cached && Date.now() - cached.at < INCIDENT_CACHE_MS) {
    return cached.incidents;
  }
  const data = await apiFetch(`/events/${eventId}/incidents/`);
  const incidents = data.incidents || [];
  incidentCache.set(eventId, { incidents, at: Date.now() });
  return incidents;
}

/**
 * Resolve first scorer for a match from Bzzoiro incidents (or squad inference).
 * @returns {{ firstTeam, firstPlayer, playerTeam, isOwnGoal, fetched: boolean }}
 */
async function resolveFirstScorerForFixture(match, fixture, { maxEventFetches, eventFetchesRef, errors } = {}) {
  const homeTeam = fixture.home;
  const awayTeam = fixture.away;
  const normalizedTeam = normalizeFirstScorerTeam(match.first_scorer_team, homeTeam, awayTeam);

  const homeGoals = fixture.homeGoals ?? fixture.homeScore;
  const awayGoals = fixture.awayGoals ?? fixture.awayScore;

  if (!firstScorerNeedsApiFetch({ ...match, first_scorer_team: normalizedTeam }, homeGoals, awayGoals)) {
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
        firstPlayer: null,
        playerTeam: inferred,
        isOwnGoal: null,
        fetched: false,
      };
    }
  }

  if (!fixture.externalId) {
    return { firstTeam: null, firstPlayer: null, playerTeam: null, isOwnGoal: null, fetched: false };
  }

  if (maxEventFetches != null && eventFetchesRef && eventFetchesRef.value >= maxEventFetches) {
    return { firstTeam: null, firstPlayer: null, playerTeam: null, isOwnGoal: null, fetched: false };
  }

  try {
    await sleep(120);
    const incidents = await fetchIncidents(fixture.externalId);
    if (eventFetchesRef) eventFetchesRef.value += 1;
    const scorer = parseFirstScorer(incidents, homeTeam, awayTeam);
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

module.exports = {
  CANONICAL_TEAMS,
  normalizeFirstScorerTeam,
  inferTeamFromSquads,
  parseFirstScorer,
  firstScorerNeedsApiFetch,
  fetchIncidents,
  resolveFirstScorerForFixture,
};
