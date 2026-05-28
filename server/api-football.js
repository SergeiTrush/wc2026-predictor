const { mapApiTeamName, normalizeKey } = require('./team-map');

const API_BASE = process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io';

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

let teamIdByCanonical = null;
const squadCache = new Map();

async function ensureTeamIndex() {
  if (teamIdByCanonical) return teamIdByCanonical;

  const { leagueId, season } = getConfig();
  const data = await apiFetch(`/teams?league=${leagueId}&season=${season}`);
  const map = new Map();

  for (const row of data.response || []) {
    const canonical = mapApiTeamName(row.team?.name);
    if (canonical && row.team?.id) {
      map.set(normalizeKey(canonical), row.team.id);
    }
  }

  teamIdByCanonical = map;
  return map;
}

async function getTeamApiId(teamName) {
  const map = await ensureTeamIndex();
  return map.get(normalizeKey(teamName)) || null;
}

async function getTeamSquad(teamName) {
  const teamId = await getTeamApiId(teamName);
  if (!teamId) return null;

  const cached = squadCache.get(teamId);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) {
    return cached.players;
  }

  const data = await apiFetch(`/players/squads?team=${teamId}`);
  const squad = data.response?.[0];
  const players = (squad?.players || [])
    .map((p) => ({
      id: p.id,
      name: p.name,
      surname: extractSurname(p.name),
      number: p.number ?? null,
      position: p.position ?? null,
    }))
    .filter((p) => p.surname)
    .sort((a, b) => a.surname.localeCompare(b.surname, 'ru'));

  squadCache.set(teamId, { at: Date.now(), players });
  return players;
}

module.exports = {
  isEnabled,
  getConfig,
  apiFetch,
  extractSurname,
  getTeamSquad,
  getTeamApiId,
};
