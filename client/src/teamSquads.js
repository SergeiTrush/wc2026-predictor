import { api } from './api';

/** In-memory cache: "Home|Away" sorted → merged player list */
const cache = new Map();

function cacheKey(homeTeam, awayTeam) {
  return [homeTeam, awayTeam].sort((a, b) => a.localeCompare(b)).join('|');
}

export async function loadMatchSquads(homeTeam, awayTeam) {
  const key = cacheKey(homeTeam, awayTeam);
  if (cache.has(key)) return cache.get(key);

  const [homeData, awayData] = await Promise.all([
    api.teamPlayers(homeTeam),
    api.teamPlayers(awayTeam),
  ]);

  const merged = [
    ...(homeData.players || []).map((p) => ({ ...p, team: homeTeam })),
    ...(awayData.players || []).map((p) => ({ ...p, team: awayTeam })),
  ].sort((a, b) => {
    const byTeam = a.team.localeCompare(b.team, 'ru');
    if (byTeam !== 0) return byTeam;
    return a.surname.localeCompare(b.surname, 'ru');
  });

  cache.set(key, merged);
  return merged;
}
