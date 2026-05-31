const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/** Render persistent disk mount (see render.yaml and Disks tab). */
const RENDER_DATA_DIR = '/var/data';
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

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

/** True when dir is a separate filesystem mount (e.g. Render persistent disk). */
function isPersistentMount(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const dirStat = fs.statSync(dir);
    const parentStat = fs.statSync(path.dirname(dir));
    return dirStat.dev !== parentStat.dev;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  const onRender = Boolean(process.env.RENDER_SERVICE_ID);
  const isProd = process.env.NODE_ENV === 'production';

  const dataDir = process.env.DATA_DIR
    || (onRender ? RENDER_DATA_DIR : DEFAULT_DATA_DIR);

  if (!isDirWritable(dataDir)) {
    const hint = onRender
      ? ` Mount a Render disk at ${RENDER_DATA_DIR} (Disks tab) and redeploy.`
      : ' Set DATA_DIR to a writable folder or fix permissions on ./data';
    throw new Error(`Database directory is not writable: ${dataDir}.${hint}`);
  }

  const persistent = isPersistentMount(dataDir);
  if (onRender && isProd && !persistent) {
    throw new Error(
      `SQLite would use ephemeral storage (${dataDir}). ` +
      `Attach a persistent disk mounted at ${RENDER_DATA_DIR} in the Render Dashboard, ` +
      'set DATA_DIR=/var/data, then redeploy. ' +
      'See https://render.com/docs/disks'
    );
  }

  return { dataDir, persistent, onRender };
}

const { dataDir, persistent, onRender } = resolveDataDir();
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

function dbStartupInfo() {
  let userCount = 0;
  try {
    userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  } catch {
    /* tables not ready yet */
  }
  return { dbPath, dataDir, persistent, onRender, userCount };
}

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
    final_home_score INTEGER,
    final_away_score INTEGER,
    first_scorer_team TEXT,
    first_scorer_player TEXT,
    external_fixture_id INTEGER,
    is_finished INTEGER NOT NULL DEFAULT 0
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
    'ALTER TABLE matches ADD COLUMN final_home_score INTEGER',
    'ALTER TABLE matches ADD COLUMN final_away_score INTEGER',
    'ALTER TABLE matches ADD COLUMN is_finished INTEGER NOT NULL DEFAULT 0',
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

function ensureFinalScoreColumns() {
  const cols = new Set(db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name));
  if (!cols.has('final_home_score')) {
    db.exec('ALTER TABLE matches ADD COLUMN final_home_score INTEGER');
  }
  if (!cols.has('final_away_score')) {
    db.exec('ALTER TABLE matches ADD COLUMN final_away_score INTEGER');
  }
}

ensureFinalScoreColumns();

function ensureIsFinishedColumn() {
  const cols = new Set(db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name));
  if (!cols.has('is_finished')) {
    db.exec('ALTER TABLE matches ADD COLUMN is_finished INTEGER NOT NULL DEFAULT 0');
    // One-time: existing scores were final before live/finished split existed
    db.exec(`
      UPDATE matches SET is_finished = 1
      WHERE home_score IS NOT NULL AND away_score IS NOT NULL
    `);
  }
}

ensureIsFinishedColumn();

function ensureBracketSlotColumn() {
  const cols = new Set(db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name));
  if (!cols.has('bracket_slot_id')) {
    db.exec('ALTER TABLE matches ADD COLUMN bracket_slot_id TEXT');
  }

  const { matchLabelToBracketSlot } = require('./data/bracket-slots');
  const rows = db.prepare('SELECT id, match_label, bracket_slot_id FROM matches').all();
  const upd = db.prepare('UPDATE matches SET bracket_slot_id = ? WHERE id = ?');
  for (const row of rows) {
    if (row.bracket_slot_id) continue;
    const slot = matchLabelToBracketSlot(row.match_label);
    if (slot) upd.run(slot, row.id);
  }
}

ensureBracketSlotColumn();

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

function predictionsSchemaOk() {
  const cols = db.prepare('PRAGMA table_info(predictions)').all();
  return cols.some((c) => c.name === 'league_id');
}

module.exports = db;
module.exports.predictionsSchemaOk = predictionsSchemaOk;
module.exports.dbStartupInfo = dbStartupInfo;
