const { prepare } = require('./sqlite-helpers');
const { KNOCKOUT_TREE } = require('./data/knockout-bracket');
const {
  FIFA_THIRD_WINNER_SLOT_TO_R32,
  isPlaceholderTeam,
} = require('./data/bracket-slots');
const { computeGroupStandings, groupStageComplete } = require('./group-standings');
const thirdPlaceCombinations = require('./data/third-place-combinations.json');

const FIFA_THIRD_SLOTS = ['1A', '1B', '1D', '1E', '1G', '1I', '1K', '1L'];

function resolveSlotCode(slot, groups) {
  if (!slot) return null;
  if (slot === '3RD') return null;

  const m = slot.match(/^(\d)([A-L])$/);
  if (!m) return null;

  const pos = Number(m[1]) - 1;
  const g = m[2];
  const order = groups[g];
  if (!order || !order[pos]) return null;
  return order[pos];
}

function resolveThirdPlaceSlots(thirdPlaces) {
  const qualified = thirdPlaces.slice(0, 8);
  if (qualified.length < 8) return {};

  const combinationKey = qualified
    .map((t) => t.group)
    .sort()
    .join('');

  const mapping = thirdPlaceCombinations[combinationKey];
  if (!mapping) return {};

  const thirdByGroup = Object.fromEntries(qualified.map((t) => [t.group, t.team]));
  const byBracketSlot = {};

  for (const fifaSlot of FIFA_THIRD_SLOTS) {
    const source = mapping[fifaSlot];
    if (!source) continue;
    const group = source.replace('3', '');
    const team = thirdByGroup[group];
    const bracketSlot = FIFA_THIRD_WINNER_SLOT_TO_R32[fifaSlot];
    if (team && bracketSlot) {
      byBracketSlot[bracketSlot] = team;
    }
  }

  return byBracketSlot;
}

function matchWinnerTeam(match) {
  if (Number(match.is_finished) !== 1) return null;
  const home = match.final_home_score ?? match.home_score;
  const away = match.final_away_score ?? match.away_score;
  if (home == null || away == null) return null;
  if (home > away) return match.home_team;
  if (away > home) return match.away_team;
  return null;
}

function matchLoserTeam(match) {
  if (Number(match.is_finished) !== 1) return null;
  const home = match.final_home_score ?? match.home_score;
  const away = match.final_away_score ?? match.away_score;
  if (home == null || away == null) return null;
  if (home > away) return match.away_team;
  if (away > home) return match.home_team;
  return null;
}

function buildInternalKnockoutTeams(db) {
  const q = (sql) => prepare(db, sql);
  const dbMatches = q(`SELECT * FROM matches WHERE stage != 'group'`).all();
  const bySlot = Object.fromEntries(
    dbMatches.filter((m) => m.bracket_slot_id).map((m) => [m.bracket_slot_id, m])
  );

  const resolved = {};
  const winners = {};
  const { groups, thirdPlaces } = computeGroupStandings(db);
  const thirdSlots =
    groupStageComplete(db) && thirdPlaces.length >= 8
      ? resolveThirdPlaceSlots(thirdPlaces)
      : {};

  for (const node of KNOCKOUT_TREE) {
    let home = node.home;
    let away = node.away;

    if (home && !home.startsWith('W:')) {
      home =
        home === '3RD'
          ? thirdSlots[node.id] || null
          : resolveSlotCode(home, groups);
    }
    if (away && !away.startsWith('W:')) {
      away =
        away === '3RD'
          ? thirdSlots[node.id] || null
          : resolveSlotCode(away, groups);
    }

    if (!node.home && !node.away) {
      const feeders = KNOCKOUT_TREE.filter((x) => x.next === node.id);
      const homeFeed = feeders.find((x) => x.nextSide === 'home');
      const awayFeed = feeders.find((x) => x.nextSide === 'away');
      home = homeFeed ? winners[homeFeed.id] || null : null;
      away = awayFeed ? winners[awayFeed.id] || null : null;
    }

    if (home) resolved[node.id] = { ...(resolved[node.id] || {}), home };
    if (away) resolved[node.id] = { ...(resolved[node.id] || {}), away };

    const dbMatch = bySlot[node.id];
    if (dbMatch) {
      const w = matchWinnerTeam(dbMatch);
      if (w && !isPlaceholderTeam(w)) winners[node.id] = w;
    }
  }

  for (const node of KNOCKOUT_TREE) {
    if (node.home || node.away) continue;
    const feeders = KNOCKOUT_TREE.filter((x) => x.next === node.id);
    const homeFeed = feeders.find((x) => x.nextSide === 'home');
    const awayFeed = feeders.find((x) => x.nextSide === 'away');
    const home = homeFeed ? winners[homeFeed.id] || resolved[node.id]?.home || null : null;
    const away = awayFeed ? winners[awayFeed.id] || resolved[node.id]?.away || null : null;
    if (home || away) {
      resolved[node.id] = {
        home: home || resolved[node.id]?.home || null,
        away: away || resolved[node.id]?.away || null,
      };
    }
  }

  const sf1 = bySlot.SF1;
  const sf2 = bySlot.SF2;
  const thirdHome = sf1 ? matchLoserTeam(sf1) : null;
  const thirdAway = sf2 ? matchLoserTeam(sf2) : null;
  if (thirdHome || thirdAway) {
    resolved.THIRD = {
      home: thirdHome && !isPlaceholderTeam(thirdHome) ? thirdHome : null,
      away: thirdAway && !isPlaceholderTeam(thirdAway) ? thirdAway : null,
    };
  }

  return resolved;
}

/**
 * Apply resolved teams to DB. Bzzoiro names always win; internal fills placeholders only.
 */
function applyKnockoutTeamUpdates(db, resolvedBySlot, { source = 'internal' } = {}) {
  const q = (sql) => prepare(db, sql);
  const update = prepare(
    db,
    `UPDATE matches SET home_team = ?, away_team = ? WHERE id = ?`
  );

  let teamsUpdated = 0;

  for (const [slotId, teams] of Object.entries(resolvedBySlot || {})) {
    const match = q('SELECT * FROM matches WHERE bracket_slot_id = ?').get(slotId);
    if (!match) continue;

    let home = match.home_team;
    let away = match.away_team;
    let changed = false;

    if (teams.home && !isPlaceholderTeam(teams.home)) {
      if (source === 'bzzoiro' || isPlaceholderTeam(home)) {
        if (home !== teams.home) {
          home = teams.home;
          changed = true;
        }
      }
    }
    if (teams.away && !isPlaceholderTeam(teams.away)) {
      if (source === 'bzzoiro' || isPlaceholderTeam(away)) {
        if (away !== teams.away) {
          away = teams.away;
          changed = true;
        }
      }
    }

    if (!changed) continue;

    update.run(home, away, match.id);
    teamsUpdated += 1;
  }

  return { teamsUpdated };
}

function resolveAndApplyKnockoutTeams(db) {
  const internal = buildInternalKnockoutTeams(db);
  return applyKnockoutTeamUpdates(db, internal, { source: 'internal' });
}

function applyBzzoiroTeamPair(db, matchId, home, away, externalId) {
  const q = (sql) => prepare(db, sql);
  if (isPlaceholderTeam(home) || isPlaceholderTeam(away)) return false;

  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return false;

  q(
    `UPDATE matches SET home_team = ?, away_team = ?,
     external_fixture_id = COALESCE(?, external_fixture_id)
     WHERE id = ?`
  ).run(home, away, externalId ?? null, matchId);

  return home !== match.home_team || away !== match.away_team;
}

module.exports = {
  buildInternalKnockoutTeams,
  applyKnockoutTeamUpdates,
  resolveAndApplyKnockoutTeams,
  applyBzzoiroTeamPair,
  matchWinnerTeam,
  matchLoserTeam,
};
