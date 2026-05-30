import { api } from './api';

/** In-memory cache: match squads keyed by match id or team pair */
const cache = new Map();

function playerSort(a, b) {
  return (a.name || a.surname || '').localeCompare(b.name || b.surname || '', 'ru');
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

async function loadSquadsFromTeams(homeTeam, awayTeam) {
  const [homeResult, awayResult] = await Promise.allSettled([
    api.teamPlayers(homeTeam),
    api.teamPlayers(awayTeam),
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
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const data = await loadSquadsFromTeams(homeTeam, awayTeam);
  const result = normalizeSquads(data);
  cache.set(cacheKey, result);
  return result;
}
