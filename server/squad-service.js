const { GROUPS } = require('./data/groups');
const localProvider = require('./squad-providers/local');
const { normalizeKey } = require('./team-map');
const bzzoiroProvider = require('./squad-providers/bzzoiro');

const ALL_TEAMS = Object.values(GROUPS).flat();

const PROVIDERS = {
  local: {
    name: 'local',
    isEnabled: () => localProvider.isEnabled(),
    getTeamSquad: (team) => Promise.resolve(localProvider.getTeamSquad(team)),
    exportAllSquads: () => {
      const teams = {};
      for (const teamName of ALL_TEAMS) {
        const players = localProvider.getTeamSquad(teamName);
        if (players?.length) teams[teamName] = players;
      }
      return Object.keys(teams).length ? teams : null;
    },
  },
  bzzoiro: {
    name: 'bzzoiro',
    isEnabled: () => bzzoiroProvider.isEnabled(),
    getTeamSquad: (team) => bzzoiroProvider.getTeamSquad(team),
    exportAllSquads: (opts) => bzzoiroProvider.exportAllSquads(opts),
  },
};

function providerOrder() {
  const raw = process.env.SQUAD_PROVIDER_ORDER || 'local,bzzoiro';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((name) => PROVIDERS[name]);
}

function isSquadEnabled() {
  return providerOrder().some((name) => PROVIDERS[name].isEnabled());
}

/** Full squad list from server/data/squads.json (no Bzzoiro). */
function getLocalSquadsBulk() {
  if (!localProvider.isEnabled()) return null;
  return localProvider.getAllSquads();
}

function getTeamFromBulk(bulk, teamName) {
  if (!bulk?.teams) return null;
  const players = bulk.teams[teamName];
  if (players?.length) return players;
  const key = normalizeKey(teamName);
  for (const [name, list] of Object.entries(bulk.teams)) {
    if (normalizeKey(name) === key && list?.length) return list;
  }
  return null;
}

async function getTeamSquad(teamName, { bulk } = {}) {
  const fromFile = getTeamFromBulk(bulk ?? getLocalSquadsBulk(), teamName);
  if (fromFile?.length) return { players: fromFile, source: 'local' };

  for (const name of providerOrder()) {
    const provider = PROVIDERS[name];
    if (!provider.isEnabled()) continue;
    try {
      const players = await provider.getTeamSquad(teamName);
      if (players?.length) return { players, source: name };
    } catch (e) {
      console.warn(`Squad provider ${name} (${teamName}):`, e.message);
    }
  }
  return null;
}

function tagPlayers(teamName, players) {
  return (players || []).map((p) => ({ ...p, team: teamName }));
}

async function getMatchSquads(homeTeam, awayTeam) {
  const bulk = getLocalSquadsBulk();
  const [homeResult, awayResult] = await Promise.allSettled([
    getTeamSquad(homeTeam, { bulk }),
    getTeamSquad(awayTeam, { bulk }),
  ]);

  const warnings = [];
  const teams = [];
  let source = null;

  const addTeam = (teamName, result) => {
    if (result.status === 'fulfilled' && result.value?.players?.length) {
      if (!source) source = result.value.source;
      teams.push({
        team: teamName,
        players: tagPlayers(teamName, result.value.players),
        source: result.value.source,
      });
      return;
    }
    if (result.status === 'rejected') {
      warnings.push(result.reason?.message || `Не удалось загрузить состав «${teamName}»`);
      return;
    }
    warnings.push(`Состав для «${teamName}» не найден`);
  };

  addTeam(homeTeam, homeResult);
  addTeam(awayTeam, awayResult);

  const players = teams.flatMap((entry) => entry.players);

  if (!players.length) {
    const err = new Error(warnings[0] || 'Не удалось загрузить составы команд');
    err.warnings = warnings;
    throw err;
  }

  return { homeTeam, awayTeam, teams, players, source, warnings };
}

module.exports = {
  isSquadEnabled,
  getLocalSquadsBulk,
  getTeamSquad,
  getMatchSquads,
  providerOrder,
  PROVIDERS,
};
