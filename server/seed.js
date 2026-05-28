const { prepare, transaction } = require('./sqlite-helpers');
const { GROUP, KNOCKOUT, SCHEDULE_VERSION } = require('./data/wc2026-schedule');

/** Kickoff in US Eastern (EDT, UTC−4) for June–July 2026. */
function kickoffEt(date, timeEt) {
  const [h, m] = timeEt.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00-04:00`).toISOString();
}

function buildMatches() {
  const rows = [];
  for (const [home, away, date, time, group, venue, md] of GROUP) {
    rows.push({
      home_team: home,
      away_team: away,
      kickoff: kickoffEt(date, time),
      matchday: md,
      stage: 'group',
      group_name: group,
      venue,
      match_label: `Group ${group}`,
    });
  }
  for (const [home, away, date, time, stage, label, venue] of KNOCKOUT) {
    rows.push({
      home_team: home,
      away_team: away,
      kickoff: kickoffEt(date, time),
      matchday: stage,
      stage,
      group_name: null,
      venue,
      match_label: label,
    });
  }
  return rows;
}

function getMeta(q, key) {
  const row = q('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setMeta(q, key, value) {
  q(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

function fixtureKey(stage, groupName, home, away) {
  const teams = [home, away].sort((a, b) => a.localeCompare(b)).join('|');
  return `${stage}|${groupName ?? ''}|${teams}`;
}

function hasLegacyCalendarMatchdays(db) {
  const q = (sql) => prepare(db, sql);
  return q(`SELECT COUNT(*) AS n FROM matches WHERE matchday GLOB '2026-??-??'`).get().n > 0;
}

function scheduleNeedsRepair(db) {
  const q = (sql) => prepare(db, sql);
  if (hasLegacyCalendarMatchdays(db)) return true;
  const md2 = q(`SELECT COUNT(*) AS n FROM matches WHERE matchday = 'md2'`).get().n;
  const expectedMd2 = buildMatches().filter((m) => m.matchday === 'md2').length;
  return md2 !== expectedMd2;
}

function applySchedule(db) {
  const q = (sql) => prepare(db, sql);
  const matches = buildMatches();
  const byFixture = new Map();
  for (const m of matches) {
    byFixture.set(fixtureKey(m.stage, m.group_name, m.home_team, m.away_team), m);
  }

  const update = prepare(
    db,
    `UPDATE matches
     SET home_team = ?, away_team = ?, kickoff = ?, matchday = ?, venue = ?, match_label = ?
     WHERE id = ?`
  );

  const rows = q('SELECT * FROM matches').all();
  let updated = 0;
  transaction(db, () => {
    for (const row of rows) {
      const m = byFixture.get(fixtureKey(row.stage, row.group_name, row.home_team, row.away_team));
      if (!m) continue;
      update.run(
        m.home_team,
        m.away_team,
        m.kickoff,
        m.matchday,
        m.venue,
        m.match_label,
        row.id
      );
      updated += 1;
    }
    setMeta(q, 'schedule_version', SCHEDULE_VERSION);
  });
  return { updated, matchCount: matches.length };
}

function seedDatabase(db) {
  const q = (sql) => prepare(db, sql);
  const count = q('SELECT COUNT(*) AS n FROM matches').get().n;
  const version = getMeta(q, 'schedule_version');

  if (count > 0) {
    if (version !== SCHEDULE_VERSION || scheduleNeedsRepair(db)) {
      const { updated, matchCount } = applySchedule(db);
      return { seeded: false, updated: true, matchCount, rowsUpdated: updated };
    }
    return { seeded: false, matchCount: count };
  }

  const insert = prepare(
    db,
    `INSERT INTO matches (home_team, away_team, kickoff, matchday, stage, group_name, venue, match_label)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const matches = buildMatches();
  transaction(db, () => {
    for (const m of matches) {
      insert.run(
        m.home_team,
        m.away_team,
        m.kickoff,
        m.matchday,
        m.stage,
        m.group_name,
        m.venue,
        m.match_label
      );
    }
    setMeta(q, 'schedule_version', SCHEDULE_VERSION);
  });
  return { seeded: true, matchCount: matches.length };
}

module.exports = { seedDatabase, buildMatches, kickoffEt, SCHEDULE_VERSION };
