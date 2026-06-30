const { buildScoringActual, scorerSide } = require('../shared/scoring');
const { getLocalSquadsBulk } = require('./squad-service');

function normName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/#\d+/g, '')
    .trim();
}

function sqSurname(s) {
  const parts = s.split(/[\s.\-]+/).filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  return last.length <= 2 && parts.length >= 2 ? parts[parts.length - 2] : last;
}

function findPlayerSide(playerName, homeTeam, awayTeam) {
  if (!playerName || playerName === 'none') return null;
  const pn = normName(playerName);
  const ps = sqSurname(pn);
  if (!pn) return null;

  try {
    const bulk = getLocalSquadsBulk();
    if (!bulk?.teams) return null;
    for (const [side, teamName] of [['home', homeTeam], ['away', awayTeam]]) {
      const found = (bulk.teams[teamName] || []).some((p) => {
        const n = normName(p.name || p.surname || '');
        if (!n) return false;
        if (pn.includes(n) || n.includes(pn)) return true;
        const ns = sqSurname(n);
        return ns.length >= 3 && ns === ps;
      });
      if (found) return side;
    }
  } catch {
    /* squad lookup is best-effort */
  }
  return null;
}

function inferFirstScorerMeta(match) {
  const homeTeam = match.home_team;
  const awayTeam = match.away_team;
  const player = match.first_scorer_player;

  let playerTeam = null;
  if (player && player !== 'none') {
    playerTeam = findPlayerSide(player, homeTeam, awayTeam);
    if (!playerTeam) {
      playerTeam = match.first_scorer_player_team || null;
    }
    if (!playerTeam && match.first_scorer_team && match.first_scorer_is_own_goal !== 1) {
      const scorerSideKey = scorerSide(match.first_scorer_team, homeTeam, awayTeam);
      if (scorerSideKey && scorerSideKey !== 'none') {
        playerTeam = scorerSideKey;
      }
    }
  }

  let isOwnGoal = null;
  if (playerTeam && match.first_scorer_team) {
    const scorerSideKey = scorerSide(match.first_scorer_team, homeTeam, awayTeam);
    isOwnGoal =
      scorerSideKey &&
      playerTeam !== 'none' &&
      scorerSideKey !== 'none' &&
      scorerSideKey !== playerTeam
        ? 1
        : 0;
  } else if (match.first_scorer_is_own_goal != null) {
    isOwnGoal = match.first_scorer_is_own_goal;
  }

  return { first_scorer_player_team: playerTeam, first_scorer_is_own_goal: isOwnGoal };
}

function enrichMatchForScoring(match, scoreOverrides = {}) {
  const meta = inferFirstScorerMeta(match);
  return buildScoringActual(
    {
      ...match,
      first_scorer_player_team: meta.first_scorer_player_team ?? match.first_scorer_player_team,
      first_scorer_is_own_goal: meta.first_scorer_is_own_goal ?? match.first_scorer_is_own_goal,
    },
    scoreOverrides
  );
}

module.exports = {
  findPlayerSide,
  inferFirstScorerMeta,
  enrichMatchForScoring,
};
