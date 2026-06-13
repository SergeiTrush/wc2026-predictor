import { teamFlag } from './utils';

function normalizePlayer(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function playerSurname(name) {
  const parts = normalizePlayer(name).split(/[\s.-]+/).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  if (last.length <= 2 && parts.length >= 2) return parts[parts.length - 2];
  return last;
}

function playersMatch(pred, actual) {
  const a = normalizePlayer(pred);
  const b = normalizePlayer(actual);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const sa = playerSurname(pred);
  const sb = playerSurname(actual);
  return sa.length >= 3 && sa === sb;
}

export function findSquadPlayer(players, playerName) {
  if (!playerName || playerName === 'none' || !Array.isArray(players)) return null;
  for (const player of players) {
    const value = (player.name || player.surname || '').trim();
    if (value && playersMatch(playerName, value)) return player;
  }
  return null;
}

/** Match-side key or stored team name → canonical team name for squad filtering. */
export function resolveFirstTeamName(value, homeTeam, awayTeam) {
  if (value === 'home') return homeTeam;
  if (value === 'away') return awayTeam;
  if (!value || value === 'none') return null;
  if (value === homeTeam || value === awayTeam) return value;
  return null;
}

/** DB value (home/away or legacy country name) → FirstTeamSelect value. */
export function canonicalFirstScorerTeam(value, homeTeam, awayTeam) {
  if (!value || value === 'none') return value || '';
  if (value === 'home' || value === 'away' || value === 'none') return value;
  if (value === homeTeam) return 'home';
  if (value === awayTeam) return 'away';
  return value;
}

export function resolveFirstTeamDisplay(value, homeTeam, awayTeam) {
  if (value === 'home') {
    return { label: homeTeam, flag: teamFlag(homeTeam), empty: false };
  }
  if (value === 'away') {
    return { label: awayTeam, flag: teamFlag(awayTeam), empty: false };
  }
  if (value === 'none') {
    return { label: 'Никто / 0:0', flag: null, empty: false };
  }
  const teamName = resolveFirstTeamName(value, homeTeam, awayTeam);
  if (teamName) {
    return { label: teamName, flag: teamFlag(teamName), empty: false };
  }
  return { label: '—', flag: null, empty: true };
}

export function resolveFirstPlayerDisplay(value, squadPlayers, teamName = null) {
  if (value === 'none') {
    return { label: 'Никто', flag: null, empty: false };
  }
  if (!value) {
    return { label: '—', flag: null, empty: true };
  }

  const squadPlayer = findSquadPlayer(squadPlayers, value);
  const team = squadPlayer?.team || teamName || null;

  return {
    label: value,
    flag: team ? teamFlag(team) : null,
    team,
    empty: false,
  };
}
