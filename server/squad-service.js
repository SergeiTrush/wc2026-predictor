const { GROUPS } = require('./data/groups');
const localProvider = require('./squad-providers/local');
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

async function getTeamSquad(teamName) {
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
  const [homeResult, awayResult] = await Promise.allSettled([
    getTeamSquad(homeTeam),
    getTeamSquad(awayTeam),
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
  getTeamSquad,
  getMatchSquads,
  providerOrder,
  PROVIDERS,
};
