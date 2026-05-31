const { GROUPS, GROUP_KEYS } = require('./data/groups');
const { prepare } = require('./sqlite-helpers');

function emptyStats(team) {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

function applyResult(stats, goalsFor, goalsAgainst) {
  stats.played += 1;
  stats.goalsFor += goalsFor;
  stats.goalsAgainst += goalsAgainst;
  if (goalsFor > goalsAgainst) {
    stats.won += 1;
    stats.points += 3;
  } else if (goalsFor === goalsAgainst) {
    stats.drawn += 1;
    stats.points += 1;
  } else {
    stats.lost += 1;
  }
}

function compareStats(a, b) {
  return (
    b.points - a.points ||
    b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    a.team.localeCompare(b.team)
  );
}

function matchIsFinishedForStandings(match) {
  return (
    Number(match.is_finished) === 1 &&
    match.home_score != null &&
    match.away_score != null
  );
}

function isGroupComplete(db, groupName) {
  const q = (sql) => prepare(db, sql);
  const row = q(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_finished = 1 AND home_score IS NOT NULL THEN 1 ELSE 0 END) AS done
     FROM matches WHERE group_name = ?`
  ).get(groupName);
  return row.total > 0 && row.total === row.done;
}

function computeGroupStandings(db) {
  const q = (sql) => prepare(db, sql);
  const matches = q(
    `SELECT * FROM matches WHERE stage = 'group' ORDER BY kickoff ASC`
  ).all();

  const tables = {};
  for (const g of GROUP_KEYS) {
    tables[g] = GROUPS[g].map((team) => emptyStats(team));
  }

  for (const match of matches) {
    if (!matchIsFinishedForStandings(match)) continue;
    const g = match.group_name;
    if (!tables[g]) continue;

    const home = tables[g].find((s) => s.team === match.home_team);
    const away = tables[g].find((s) => s.team === match.away_team);
    if (!home || !away) continue;

    applyResult(home, match.home_score, match.away_score);
    applyResult(away, match.away_score, match.home_score);
  }

  const groups = {};
  const thirdPlaces = [];

  for (const g of GROUP_KEYS) {
    if (!isGroupComplete(db, g)) {
      groups[g] = null;
      continue;
    }
    const ordered = [...tables[g]].sort(compareStats);
    groups[g] = ordered.map((s) => s.team);
    if (ordered[2]) {
      thirdPlaces.push({
        group: g,
        team: ordered[2].team,
        points: ordered[2].points,
        goalDifference: ordered[2].goalsFor - ordered[2].goalsAgainst,
        goalsFor: ordered[2].goalsFor,
      });
    }
  }

  thirdPlaces.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.group.localeCompare(b.group)
  );

  return { groups, thirdPlaces };
}

function groupStageComplete(db) {
  const q = (sql) => prepare(db, sql);
  const row = q(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_finished = 1 AND home_score IS NOT NULL THEN 1 ELSE 0 END) AS done
     FROM matches WHERE stage = 'group'`
  ).get();
  return row.total > 0 && row.total === row.done;
}

module.exports = {
  computeGroupStandings,
  groupStageComplete,
  isGroupComplete,
  compareStats,
};
