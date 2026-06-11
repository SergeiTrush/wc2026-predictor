/**
 * Directly patches the local SQLite DB: sets first_scorer_team for any match
 * where first_scorer_player is set but first_scorer_team is null.
 * Run from wc2026-predictor-main/: node scripts/fix-first-team-now.js
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../data/wc2026.db');
const squadsPath = path.join(__dirname, '../server/data/squads.json');

const db = new Database(dbPath);
const raw = JSON.parse(fs.readFileSync(squadsPath, 'utf8'));
const teamsByName = raw.teams || {};

function norm(name) {
  return (name || '').toLowerCase().normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/#\d+/g, '').trim();
}

function inferSide(player, homeTeam, awayTeam) {
  const pn = norm(player);
  for (const [side, team] of [['home', homeTeam], ['away', awayTeam]]) {
    if ((teamsByName[team] || []).some(p => {
      const n = norm(p.name || p.surname || '');
      return n && (pn.includes(n) || n.includes(pn));
    })) return side;
  }
  return null;
}

const rows = db.prepare(
  `SELECT id, home_team, away_team, first_scorer_player
   FROM matches WHERE first_scorer_player IS NOT NULL AND first_scorer_team IS NULL`
).all();

if (!rows.length) {
  console.log('Nothing to fix — all matches with a player already have a team set.');
  db.close(); process.exit(0);
}

const upd = db.prepare(`UPDATE matches SET first_scorer_team=? WHERE id=?`);
let fixed = 0;
for (const r of rows) {
  const side = inferSide(r.first_scorer_player, r.home_team, r.away_team);
  if (side) {
    upd.run(side, r.id);
    console.log(`✓ Match ${r.id} (${r.home_team} vs ${r.away_team}): first_scorer_team = '${side}'  [player: ${r.first_scorer_player}]`);
    fixed++;
  } else {
    console.warn(`✗ Match ${r.id} (${r.home_team} vs ${r.away_team}): could not infer team for player '${r.first_scorer_player}'`);
  }
}
console.log(`\nDone: ${fixed}/${rows.length} fixed.`);
db.close();
