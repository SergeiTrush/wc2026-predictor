const { GROUPS } = require('../data/groups');
const { mapApiTeamName, normalizeKey, apiSearchNames } = require('../team-map');
const { normalizePlayers, toPlayer } = require('../player-normalize');
const { isEnabled, apiFetch } = require('../bzzoiro-client');

const ALL_TEAMS = Object.values(GROUPS).flat();

let squadIndex = null;
let squadIndexAt = 0;
const teamIdCache = new Map();

async function findTeamId(teamName) {
  const key = normalizeKey(teamName);
  if (teamIdCache.has(key)) return teamIdCache.get(key);

  for (const searchName of apiSearchNames(teamName)) {
    const data = await apiFetch(`/teams/?name=${encodeURIComponent(searchName)}&limit=50`);
    for (const row of data.results || []) {
      const canonical = mapApiTeamName(row.name);
      if (canonical && normalizeKey(canonical) === key) {
        teamIdCache.set(key, row.id);
        return row.id;
      }
    }
  }

  teamIdCache.set(key, null);
  return null;
}

function rowsToPlayers(rows) {
  return normalizePlayers(
    (rows || []).map((row) =>
      toPlayer({
        id: row.player_id || row.id,
        name: row.name,
        number: row.jersey_number,
        position: row.position,
      })
    )
  );
}

async function fetchTeamSquad(teamName) {
  const teamId = await findTeamId(teamName);
  if (!teamId) return null;

  const data = await apiFetch(`/worldcup/squads/${teamId}/`);
  const official = (data.results || []).filter((row) => row.status === 'official');
  const rows = official.length ? official : data.results || [];
  const players = rowsToPlayers(rows);
  return players.length ? players : null;
}

async function buildIndex() {
  const index = new Map();
  for (const teamName of ALL_TEAMS) {
    try {
      const players = await fetchTeamSquad(teamName);
      if (players?.length) index.set(normalizeKey(teamName), players);
    } catch (e) {
      console.warn(`Bzzoiro squad ${teamName}:`, e.message);
    }
  }
  return index;
}

async function ensureIndex() {
  if (squadIndex && Date.now() - squadIndexAt < 24 * 60 * 60 * 1000) {
    return squadIndex;
  }
  squadIndex = await buildIndex();
  squadIndexAt = Date.now();
  return squadIndex;
}

async function getTeamSquad(teamName) {
  const cached = squadIndex?.get(normalizeKey(teamName));
  if (cached?.length) return cached;

  try {
    const players = await fetchTeamSquad(teamName);
    if (players?.length) {
      if (!squadIndex) squadIndex = new Map();
      squadIndex.set(normalizeKey(teamName), players);
      return players;
    }
  } catch (e) {
    console.warn(`Bzzoiro squad ${teamName}:`, e.message);
  }
  return null;
}

async function exportAllSquads({ delayMs = 400 } = {}) {
  squadIndex = null;
  const teams = {};
  for (const teamName of ALL_TEAMS) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const players = await fetchTeamSquad(teamName);
    if (players?.length) teams[teamName] = players;
  }
  return teams;
}

module.exports = { isEnabled, getTeamSquad, exportAllSquads };
