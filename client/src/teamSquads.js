import { api } from './api';

/** Match squads keyed by home|away pair */
const matchCache = new Map();

/** Per-team API responses (teams missing from squads.json) */
const teamApiCache = new Map();

let bulkSquads = null;
let bulkSquadsPromise = null;

function playerSort(a, b) {
  return (a.name || a.surname || '').localeCompare(b.name || b.surname || '', 'ru');
}

function normalizeTeamKey(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function normalizeSquads(data) {
  const teams = (data.teams || []).map((entry) => ({
    team: entry.team,
    players: [...(entry.players || [])].sort(playerSort),
  }));

  const players = teams.flatMap((entry) => entry.players);

  return {
    homeTeam: data.homeTeam,
    awayTeam: data.awayTeam,
    teams,
    players,
    warnings: data.warnings || [],
    source: data.source || null,
  };
}

/** Load server/data/squads.json once — avoids per-team /api/teams/.../players calls. */
async function ensureBulkSquads() {
  if (bulkSquads !== null) return bulkSquads;
  if (!bulkSquadsPromise) {
    bulkSquadsPromise = api
      .squads()
      .then((data) => {
        bulkSquads = data?.teams && typeof data.teams === 'object' ? data.teams : {};
        return bulkSquads;
      })
      .catch(() => {
        bulkSquads = {};
        return bulkSquads;
      });
  }
  return bulkSquadsPromise;
}

function playersFromBulk(bulk, teamName) {
  if (!bulk || !teamName) return null;
  if (bulk[teamName]?.length) return bulk[teamName];
  const key = normalizeTeamKey(teamName);
  for (const [name, players] of Object.entries(bulk)) {
    if (normalizeTeamKey(name) === key && players?.length) return players;
  }
  return null;
}

async function loadTeamPlayers(teamName) {
  const bulk = await ensureBulkSquads();
  const fromFile = playersFromBulk(bulk, teamName);
  if (fromFile?.length) {
    return { players: fromFile, source: 'local' };
  }

  if (teamApiCache.has(teamName)) return teamApiCache.get(teamName);

  const result = await api.teamPlayers(teamName);
  teamApiCache.set(teamName, result);
  if (result?.players?.length) bulk[teamName] = result.players;
  return result;
}

async function loadSquadsFromTeams(homeTeam, awayTeam) {
  const [homeResult, awayResult] = await Promise.allSettled([
    loadTeamPlayers(homeTeam),
    loadTeamPlayers(awayTeam),
  ]);

  const teams = [];
  const warnings = [];

  if (homeResult.status === 'fulfilled' && homeResult.value.players?.length) {
    teams.push({
      team: homeTeam,
      players: homeResult.value.players.map((p) => ({ ...p, team: homeTeam })),
    });
  } else if (homeResult.status === 'rejected') {
    warnings.push(homeResult.reason?.message);
  }

  if (awayResult.status === 'fulfilled' && awayResult.value.players?.length) {
    teams.push({
      team: awayTeam,
      players: awayResult.value.players.map((p) => ({ ...p, team: awayTeam })),
    });
  } else if (awayResult.status === 'rejected') {
    warnings.push(awayResult.reason?.message);
  }

  if (!teams.length) {
    throw new Error(warnings[0] || 'Не удалось загрузить составы команд');
  }

  return { homeTeam, awayTeam, teams, warnings };
}

export async function loadMatchSquads(homeTeam, awayTeam) {
  const cacheKey = `${homeTeam}|${awayTeam}`;
  if (matchCache.has(cacheKey)) return matchCache.get(cacheKey);

  const data = await loadSquadsFromTeams(homeTeam, awayTeam);
  const result = normalizeSquads(data);
  matchCache.set(cacheKey, result);
  return result;
}
