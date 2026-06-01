const fs = require('fs');
const path = require('path');
const { normalizeKey } = require('../team-map');
const { normalizePlayers } = require('../player-normalize');

const SQUADS_PATH = path.join(__dirname, '../data/squads.json');

let cache = null;
let cacheMtime = 0;

function hasSquadsFile() {
  try {
    return fs.existsSync(SQUADS_PATH);
  } catch {
    return false;
  }
}

function isEnabled() {
  const data = loadFile();
  return Boolean(data?.byKey?.size);
}

function loadFile() {
  if (!hasSquadsFile()) return null;

  const stat = fs.statSync(SQUADS_PATH);
  if (cache && stat.mtimeMs === cacheMtime) return cache;

  const raw = JSON.parse(fs.readFileSync(SQUADS_PATH, 'utf8'));
  const teams = raw.teams || {};
  const byKey = new Map();

  const teamsByName = {};
  for (const [teamName, players] of Object.entries(teams)) {
    const normalized = normalizePlayers(players);
    teamsByName[teamName] = normalized;
    byKey.set(normalizeKey(teamName), normalized);
  }

  cache = {
    updatedAt: raw.updated_at || null,
    source: raw.source || 'local',
    byKey,
    teamsByName,
  };
  cacheMtime = stat.mtimeMs;
  return cache;
}

function getTeamSquad(teamName) {
  const data = loadFile();
  if (!data) return null;
  return data.byKey.get(normalizeKey(teamName)) || null;
}

function getAllSquads() {
  const data = loadFile();
  if (!data?.teamsByName) return null;
  return {
    updatedAt: data.updatedAt,
    source: data.source,
    teams: { ...data.teamsByName },
  };
}

module.exports = { isEnabled, hasSquadsFile, getTeamSquad, getAllSquads, SQUADS_PATH };
