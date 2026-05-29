const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

function isDirWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  const candidates = [];
  if (process.env.DATA_DIR) {
    candidates.push(process.env.DATA_DIR);
  }
  candidates.push(path.join(__dirname, '..', 'data'));
  if (process.env.NODE_ENV !== 'production') {
    candidates.push(path.join(os.homedir(), '.wc2026-predictor'));
  }

  for (const dir of candidates) {
    if (isDirWritable(dir)) {
      if (process.env.DATA_DIR && dir !== process.env.DATA_DIR) {
        console.warn(
          `DATA_DIR "${process.env.DATA_DIR}" is not writable — using ${dir} instead`
        );
      }
      return dir;
    }
  }

  throw new Error(
    'No writable directory for SQLite. Set DATA_DIR to a writable folder or fix permissions on ./data'
  );
}

const dataDir = resolveDataDir();
const dbPath = path.join(dataDir, 'wc2026.db');

if (fs.existsSync(dbPath)) {
  try {
    fs.accessSync(dbPath, fs.constants.W_OK);
  } catch {
    fs.chmodSync(dbPath, 0o644);
    try {
      fs.accessSync(path.dirname(dbPath), fs.constants.W_OK);
    } catch {
      throw new Error(`Database file is not writable: ${dbPath}`);
    }
  }
}

const db = new Database(dbPath);
console.log(`SQLite database: ${dbPath}`);

db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS league_members (
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suspended INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (league_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    kickoff TEXT NOT NULL,
    matchday TEXT,
    stage TEXT NOT NULL,
    group_name TEXT,
    venue TEXT,
    match_label TEXT,
    home_score INTEGER,
    away_score INTEGER,
    first_scorer_team TEXT,
    first_scorer_player TEXT,
    external_fixture_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bracket_picks (
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    picks TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (league_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS predictions (
    league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    home_pred INTEGER NOT NULL,
    away_pred INTEGER NOT NULL,
    first_team TEXT,
    first_player TEXT,
    booster INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (league_id, user_id, match_id),
    CHECK (home_pred >= 0 AND away_pred >= 0)
  );
`);

function migrate() {
  const alters = [
    'ALTER TABLE league_members ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE matches ADD COLUMN matchday TEXT',
    'ALTER TABLE matches ADD COLUMN first_scorer_team TEXT',
    'ALTER TABLE matches ADD COLUMN first_scorer_player TEXT',
    'ALTER TABLE predictions ADD COLUMN first_team TEXT',
    'ALTER TABLE predictions ADD COLUMN first_player TEXT',
    'ALTER TABLE predictions ADD COLUMN booster INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE matches ADD COLUMN external_fixture_id INTEGER',
  ];
  for (const sql of alters) {
    try {
      db.exec(sql);
    } catch {
      /* column exists */
    }
  }
}

migrate();

function migratePredictionsPerLeague() {
  const cols = db.prepare('PRAGMA table_info(predictions)').all();
  if (cols.some((c) => c.name === 'league_id')) {
    return;
  }
  db.exec(`
    CREATE TABLE predictions_by_league (
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      home_pred INTEGER NOT NULL,
      away_pred INTEGER NOT NULL,
      first_team TEXT,
      first_player TEXT,
      booster INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (league_id, user_id, match_id),
      CHECK (home_pred >= 0 AND away_pred >= 0)
    );
    DROP TABLE predictions;
    ALTER TABLE predictions_by_league RENAME TO predictions;
  `);
}

migratePredictionsPerLeague();

// Clear results entered before kickoff (e.g. test data) so predictions stay open
try {
  db.exec(`
    UPDATE matches
    SET home_score = NULL, away_score = NULL,
        first_scorer_team = NULL, first_scorer_player = NULL
    WHERE home_score IS NOT NULL
      AND datetime(kickoff) > datetime('now')
  `);
} catch {
  /* ignore */
}

function predictionsSchemaOk() {
  const cols = db.prepare('PRAGMA table_info(predictions)').all();
  return cols.some((c) => c.name === 'league_id');
}

module.exports = db;
module.exports.predictionsSchemaOk = predictionsSchemaOk;
