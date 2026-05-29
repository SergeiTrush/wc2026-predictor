import { api } from './api';

/** In-memory cache: "Home|Away" sorted → merged player list */
const cache = new Map();

function cacheKey(homeTeam, awayTeam) {
  return [homeTeam, awayTeam].sort((a, b) => a.localeCompare(b)).join('|');
}

export async function loadMatchSquads(homeTeam, awayTeam) {
  const key = cacheKey(homeTeam, awayTeam);
  if (cache.has(key)) return cache.get(key);

  const [homeResult, awayResult] = await Promise.allSettled([
    api.teamPlayers(homeTeam),
    api.teamPlayers(awayTeam),
  ]);

  const errors = [];
  const homePlayers =
    homeResult.status === 'fulfilled' ? homeResult.value.players || [] : [];
  const awayPlayers =
    awayResult.status === 'fulfilled' ? awayResult.value.players || [] : [];

  if (homeResult.status === 'rejected') errors.push(homeResult.reason?.message);
  if (awayResult.status === 'rejected') errors.push(awayResult.reason?.message);

  const merged = [
    ...homePlayers.map((p) => ({ ...p, team: homeTeam })),
    ...awayPlayers.map((p) => ({ ...p, team: awayTeam })),
  ].sort((a, b) => {
    const byTeam = a.team.localeCompare(b.team, 'ru');
    if (byTeam !== 0) return byTeam;
    return a.surname.localeCompare(b.surname, 'ru');
  });

  if (!merged.length && errors.length) {
    throw new Error(errors[0] || 'Не удалось загрузить составы команд');
  }

  cache.set(key, merged);
  return merged;
}
