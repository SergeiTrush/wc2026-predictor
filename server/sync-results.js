const { prepare } = require('./sqlite-helpers');
const { mapApiTeamName } = require('./team-map');
const { isEnabled, getConfig, apiFetch } = require('./api-football');

const FINISHED = new Set(['FT', 'AET', 'PEN']);

function kickoffDate(iso) {
  return iso.slice(0, 10);
}

function findMatch(q, { fixtureId, home, away, date }) {
  if (fixtureId) {
    const byId = q('SELECT * FROM matches WHERE external_fixture_id = ?').get(fixtureId);
    if (byId) return byId;
  }
  if (!home || !away) return null;

  const rows = q(
    `SELECT * FROM matches
     WHERE home_team = ? AND away_team = ?
       AND substr(kickoff, 1, 10) = ?`
  ).all(home, away, date);

  if (rows.length === 1) return rows[0];

  const fuzzy = q(
    `SELECT * FROM matches
     WHERE home_team = ? AND away_team = ?`
  ).all(home, away);
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
}

function parseFirstScorer(events, homeName, awayName) {
  if (!Array.isArray(events)) return { team: null, player: null };

  const goals = events
    .filter((e) => e.type === 'Goal' && e.detail !== 'Missed Penalty')
    .map((e) => ({
      minute: (e.time?.elapsed ?? 999) + (e.time?.extra ?? 0) / 100,
      teamApi: e.team?.name,
      player: e.player?.name,
    }))
    .sort((a, b) => a.minute - b.minute);

  if (!goals.length) return { team: null, player: null };

  const first = goals[0];
  const home = mapApiTeamName(homeName);
  const away = mapApiTeamName(awayName);
  const scorerTeam = mapApiTeamName(first.teamApi);

  let firstTeam = null;
  if (scorerTeam === home) firstTeam = 'home';
  else if (scorerTeam === away) firstTeam = 'away';

  return { team: firstTeam, player: first.player || null };
}

async function fetchFixtureEvents(fixtureId) {
  const data = await apiFetch(`/fixtures/events?fixture=${fixtureId}`);
  return data.response || [];
}

async function fetchLeagueFixtures(leagueId, season) {
  const data = await apiFetch(`/fixtures?league=${leagueId}&season=${season}`);
  return data.response || [];
}

async function fetchFixturesByDate(date) {
  const data = await apiFetch(`/fixtures?date=${date}`);
  return data.response || [];
}

function setMeta(q, key, value) {
  q(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

function getMeta(q, key) {
  const row = q('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row?.value ?? null;
}

/**
 * Sync finished fixtures from API-Football into matches table.
 */
async function syncResultsFromApi(db) {
  const q = (sql) => prepare(db, sql);
  const cfg = getConfig();

  if (!cfg.enabled) {
    return { ok: false, error: 'API_FOOTBALL_KEY not configured', updated: 0 };
  }

  let fixtures = [];
  const errors = [];
  try {
    fixtures = await fetchLeagueFixtures(cfg.leagueId, cfg.season);
  } catch (err) {
    console.warn('League fixtures fetch failed:', err.message);
  }

  if (fixtures.length < 5) {
    const recentDays = q(
      `SELECT DISTINCT substr(kickoff, 1, 10) AS d FROM matches
       WHERE substr(kickoff, 1, 10) <= date('now')
       ORDER BY d DESC LIMIT 7`
    ).all();
    const seen = new Set(fixtures.map((f) => f.fixture?.id));
    for (const { d } of recentDays) {
      try {
        await new Promise((r) => setTimeout(r, 200));
        const dayFixtures = await fetchFixturesByDate(d);
        for (const f of dayFixtures) {
          const id = f.fixture?.id;
          if (id && !seen.has(id)) {
            seen.add(id);
            fixtures.push(f);
          }
        }
      } catch (err) {
        errors.push(`date ${d}: ${err.message}`);
      }
    }
  }

  if (!fixtures.length) {
    setMeta(q, 'results_sync_error', 'No fixtures returned from API-Football');
    return { ok: false, error: 'No fixtures from API', updated: 0 };
  }

  const updateMatch = q(
    `UPDATE matches SET
       home_score = ?,
       away_score = ?,
       first_scorer_team = COALESCE(?, first_scorer_team),
       first_scorer_player = COALESCE(?, first_scorer_player),
       external_fixture_id = COALESCE(external_fixture_id, ?)
     WHERE id = ?`
  );

  let updated = 0;
  let skipped = 0;
  let eventFetches = 0;

  for (const item of fixtures) {
    const status = item.fixture?.status?.short;
    if (!FINISHED.has(status)) continue;

    const homeGoals = item.goals?.home;
    const awayGoals = item.goals?.away;
    if (homeGoals == null || awayGoals == null) continue;

    const home = mapApiTeamName(item.teams?.home?.name);
    const away = mapApiTeamName(item.teams?.away?.name);
    const fixtureId = item.fixture?.id;
    const date = kickoffDate(item.fixture?.date || '');

    const match = findMatch(q, { fixtureId, home, away, date });
    if (!match) {
      skipped += 1;
      continue;
    }

    let firstTeam = null;
    let firstPlayer = null;

    if (
      eventFetches < cfg.maxEventFetches &&
      fixtureId &&
      (match.first_scorer_team == null || match.first_scorer_player == null)
    ) {
      try {
        await new Promise((r) => setTimeout(r, 120));
        const events = await fetchFixtureEvents(fixtureId);
        eventFetches += 1;
        const scorer = parseFirstScorer(events, item.teams?.home?.name, item.teams?.away?.name);
        firstTeam = scorer.team;
        firstPlayer = scorer.player;
      } catch (err) {
        errors.push(`events ${fixtureId}: ${err.message}`);
      }
    }

    updateMatch.run(
      homeGoals,
      awayGoals,
      firstTeam,
      firstPlayer,
      fixtureId,
      match.id
    );
    updated += 1;
  }

  const summary = {
    ok: true,
    updated,
    skipped,
    eventFetches,
    fixturesSeen: fixtures.length,
    errors: errors.slice(0, 5),
  };

  setMeta(q, 'results_sync_last', new Date().toISOString());
  setMeta(q, 'results_sync_summary', JSON.stringify(summary));
  setMeta(q, 'results_sync_error', '');

  return summary;
}

function getSyncStatus(db) {
  const q = (sql) => prepare(db, sql);
  const cfg = getConfig();
  let lastSummary = null;
  try {
    const raw = getMeta(q, 'results_sync_summary');
    if (raw) lastSummary = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    enabled: cfg.enabled,
    provider: 'API-Football (api-sports.io)',
    leagueId: cfg.leagueId,
    season: cfg.season,
    lastSync: getMeta(q, 'results_sync_last'),
    lastError: getMeta(q, 'results_sync_error') || null,
    lastSummary,
  };
}

function startResultsSyncScheduler(db) {
  const cfg = getConfig();
  if (!cfg.enabled) {
    console.log('Results sync: disabled (set API_FOOTBALL_KEY to enable)');
    return;
  }

  const run = async () => {
    try {
      const result = await syncResultsFromApi(db);
      console.log(
        `Results sync: updated ${result.updated}, skipped ${result.skipped}${result.error ? ` — ${result.error}` : ''}`
      );
    } catch (err) {
      console.error('Results sync failed:', err.message);
      const q = (sql) => prepare(db, sql);
      setMeta(q, 'results_sync_error', err.message);
    }
  };

  setTimeout(run, 8000);
  setInterval(run, cfg.intervalMs);
  console.log(`Results sync: scheduled every ${Math.round(cfg.intervalMs / 60000)} min`);
}

module.exports = {
  isEnabled,
  getConfig,
  syncResultsFromApi,
  getSyncStatus,
  startResultsSyncScheduler,
};
