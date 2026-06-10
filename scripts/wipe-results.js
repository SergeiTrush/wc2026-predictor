const Database = require('better-sqlite3');
const db = new Database('./data/wc2026.db');
const result = db.prepare(
  'UPDATE matches SET home_score = NULL, away_score = NULL, final_home_score = NULL, final_away_score = NULL, is_finished = 0, first_scorer_team = NULL, first_scorer_player = NULL'
).run();
console.log(`Done: ${result.changes} matches wiped`);
db.close();
