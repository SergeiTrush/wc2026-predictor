const { mapApiTeamName, normalizeKey } = require('./team-map');

const API_BASE = process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io';

/** Extra search terms when league index misses a national team. */
const SEARCH_HINTS = {
  'united states': ['USA'],
  'south korea': ['Korea Republic'],
  'dr congo': ['Congo DR', 'DR Congo'],
  'ivory coast': ["Cote d'Ivoire", 'Côte d\'Ivoire'],
  'bosnia and herzegovina': ['Bosnia'],
  'cape verde': ['Cabo Verde'],
  'czechia': ['Czech Republic'],
  'curacao': ['Curaçao'],
};

function isEnabled() {
  return Boolean(process.env.API_FOOTBALL_KEY?.trim());
}

function getConfig() {
  return {
    enabled: isEnabled(),
    leagueId: Number(process.env.API_FOOTBALL_LEAGUE_ID || 1),
    season: Number(process.env.API_FOOTBALL_SEASON || 2026),
    intervalMs: Number(process.env.RESULTS_SYNC_INTERVAL_MS || 15 * 60 * 1000),
    maxEventFetches: Number(process.env.RESULTS_SYNC_MAX_EVENTS || 15),
  };
}

async function apiFetch(path) {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'x-apisports-key': key,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.errors?.[0] || data.message || `API-Football HTTP ${res.status}`);
  }
  if (data.errors?.length) {
    throw new Error(data.errors.join(', '));
  }
  return data;
}

function extractSurname(fullName) {
  const parts = (fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  if (last.length <= 2 && parts.length >= 2) return parts[parts.length - 2];
  return last;
}

function normalizePlayers(rawPlayers) {
  return rawPlayers
    .map((p) => ({
      id: p.id,
      name: p.name,
      surname: extractSurname(p.name),
      number: p.number ?? null,
      position: p.position ?? null,
    }))
    .filter((p) => p.surname)
    .sort((a, b) => a.surname.localeCompare(b.surname, 'ru'));
}

let teamIdByCanonical = null;
const teamIdCache = new Map();
const squadCache = new Map();

async function ensureTeamIndex() {
  if (teamIdByCanonical) return teamIdByCanonical;

  const { leagueId, season } = getConfig();
  const map = new Map();

  try {
    const data = await apiFetch(`/teams?league=${leagueId}&season=${season}`);
    for (const row of data.response || []) {
      const canonical = mapApiTeamName(row.team?.name);
      if (canonical && row.team?.id) {
        map.set(normalizeKey(canonical), row.team.id);
      }
    }
  } catch (e) {
    console.warn('API-Football team index:', e.message);
  }

  teamIdByCanonical = map;
  return map;
}

function searchTermsForTeam(teamName) {
  const key = normalizeKey(teamName);
  const terms = new Set([teamName]);
  for (const hint of SEARCH_HINTS[key] || []) {
    terms.add(hint);
  }
  return [...terms];
}

async function searchTeamId(teamName) {
  for (const term of searchTermsForTeam(teamName)) {
    const data = await apiFetch(`/teams?search=${encodeURIComponent(term)}`);
    for (const row of data.response || []) {
      const apiTeam = row.team;
      if (!apiTeam?.id) continue;
      const mapped = mapApiTeamName(apiTeam.name);
      if (mapped && normalizeKey(mapped) === normalizeKey(teamName)) {
        return apiTeam.id;
      }
    }
  }
  return null;
}

async function getTeamApiId(teamName) {
  const key = normalizeKey(teamName);
  if (teamIdCache.has(key)) return teamIdCache.get(key);

  const index = await ensureTeamIndex();
  let teamId = index.get(key) || null;
  if (!teamId) {
    teamId = await searchTeamId(teamName);
  }

  if (teamId) teamIdCache.set(key, teamId);
  return teamId;
}

async function fetchSquadFromSquadsEndpoint(teamId) {
  const data = await apiFetch(`/players/squads?team=${teamId}`);
  const squad = data.response?.[0];
  return normalizePlayers(squad?.players || []);
}

async function fetchSquadFromPlayersEndpoint(teamId, seasons) {
  const byId = new Map();

  for (const season of seasons) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 6) {
      const data = await apiFetch(`/players?team=${teamId}&season=${season}&page=${page}`);
      totalPages = Number(data.paging?.total) || 1;

      for (const row of data.response || []) {
        const player = row.player;
        if (!player?.id || byId.has(player.id)) continue;

        const stats = row.statistics?.[0];
        byId.set(player.id, {
          id: player.id,
          name: player.name,
          surname: extractSurname(player.name),
          number: stats?.games?.number ?? null,
          position: stats?.games?.position ?? player.position ?? null,
        });
      }

      if (!(data.response || []).length) break;
      page += 1;
    }
  }

  return normalizePlayers([...byId.values()]);
}

async function getTeamSquad(teamName) {
  const teamId = await getTeamApiId(teamName);
  if (!teamId) return null;

  const cached = squadCache.get(teamId);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) {
    return cached.players;
  }

  const { season } = getConfig();
  const fallbackSeasons = [...new Set([season, 2024, 2022, 2023])];

  let players = await fetchSquadFromSquadsEndpoint(teamId);
  if (!players.length) {
    players = await fetchSquadFromPlayersEndpoint(teamId, fallbackSeasons);
  }

  squadCache.set(teamId, { at: Date.now(), players });
  return players.length ? players : null;
}

module.exports = {
  isEnabled,
  getConfig,
  apiFetch,
  extractSurname,
  getTeamSquad,
  getTeamApiId,
  searchTeamId,
  normalizePlayers,
};
