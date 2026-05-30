const { prepare } = require('../sqlite-helpers');
const { mapApiTeamName } = require('../team-map');
const { isEnabled, getConfig, apiFetch } = require('../bzzoiro-client');

const FINISHED = new Set(['finished']);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    `SELECT * FROM matches WHERE home_team = ? AND away_team = ?`
  ).all(home, away);
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
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

async function resolveLeagueId() {
  const { leagueId } = getConfig();
  if (leagueId) return leagueId;

  const data = await apiFetch('/leagues/?limit=200');
  for (const league of data.results || []) {
    const name = (league.name || '').toLowerCase();
    if (name.includes('world cup') && (name.includes('2026') || name.includes('fifa'))) {
      return league.id;
    }
  }
  for (const league of data.results || []) {
    if ((league.name || '').toLowerCase().includes('world cup')) return league.id;
  }
  return null;
}

async function fetchEventsPaginated(query) {
  const events = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const data = await apiFetch(`${query}&limit=${limit}&offset=${offset}`);
    const batch = data.results || [];
    events.push(...batch);
    if (!batch.length || events.length >= (data.count || batch.length)) break;
    offset += limit;
    if (offset > 5000) break;
  }

  return events;
}

async function fetchFinishedEvents(q) {
  const leagueId = await resolveLeagueId();
  const byId = new Map();

  if (leagueId) {
    const events = await fetchEventsPaginated(
      `/events/?league_id=${leagueId}&status=finished`
    );
    for (const event of events) byId.set(event.id, event);
  }

  if (byId.size < 5) {
    const dates = q(
      `SELECT DISTINCT substr(kickoff, 1, 10) AS d FROM matches
       WHERE substr(kickoff, 1, 10) <= date('now')
       ORDER BY d DESC LIMIT 14`
    ).all();

    for (const { d } of dates) {
      try {
        await sleep(150);
        const events = await fetchEventsPaginated(
          `/events/?date_from=${d}&date_to=${d}&status=finished`
        );
        for (const event of events) {
          const home = mapApiTeamName(event.home_team);
          const away = mapApiTeamName(event.away_team);
          if (home && away) byId.set(event.id, event);
        }
      } catch (err) {
        console.warn(`Bzzoiro events ${d}:`, err.message);
      }
    }
  }

  return [...byId.values()];
}

function normalizeEvent(event) {
  const home = mapApiTeamName(event.home_team);
  const away = mapApiTeamName(event.away_team);
  if (!home || !away) return null;
  if (event.home_score == null || event.away_score == null) return null;

  return {
    externalId: event.id,
    home,
    away,
    homeGoals: event.home_score,
    awayGoals: event.away_score,
    kickoffDate: (event.event_date || '').slice(0, 10),
    finished: FINISHED.has(event.status),
  };
}

function parseFirstScorer(incidents) {
  if (!Array.isArray(incidents)) return { team: null, player: null };

  const goals = incidents
    .filter((i) => i.type === 'goal')
    .map((i) => ({
      minute: (i.minute ?? 999) + (i.added_time ?? 0) / 100,
      isHome: i.is_home,
      player: i.player || null,
    }))
    .sort((a, b) => a.minute - b.minute);

  if (!goals.length) return { team: null, player: null };

  const first = goals[0];
  let firstTeam = null;
  if (first.isHome === true) firstTeam = 'home';
  else if (first.isHome === false) firstTeam = 'away';

  return { team: firstTeam, player: first.player };
}

async function fetchIncidents(eventId) {
  const data = await apiFetch(`/events/${eventId}/incidents/`);
  return data.incidents || [];
}

async function syncResults(db) {
  const q = (sql) => prepare(db, sql);
  const cfg = getConfig();

  if (!isEnabled()) {
    return { ok: false, error: 'BZZOIRO_API_TOKEN not configured', updated: 0 };
  }

  const rawEvents = await fetchFinishedEvents(q);
  const fixtures = rawEvents.map(normalizeEvent).filter(Boolean);

  if (!fixtures.length) {
    setMeta(q, 'results_sync_error', 'No finished events returned from Bzzoiro');
    return { ok: false, error: 'No fixtures from Bzzoiro', updated: 0, fixturesSeen: 0 };
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
  const errors = [];

  for (const fixture of fixtures) {
    if (!fixture.finished) continue;

    const match = findMatch(q, {
      fixtureId: fixture.externalId,
      home: fixture.home,
      away: fixture.away,
      date: fixture.kickoffDate,
    });
    if (!match) {
      skipped += 1;
      continue;
    }

    let firstTeam = null;
    let firstPlayer = null;

    if (
      eventFetches < cfg.maxEventFetches &&
      fixture.externalId &&
      (match.first_scorer_team == null || match.first_scorer_player == null)
    ) {
      try {
        await sleep(120);
        const incidents = await fetchIncidents(fixture.externalId);
        eventFetches += 1;
        const scorer = parseFirstScorer(incidents);
        firstTeam = scorer.team;
        firstPlayer = scorer.player;
      } catch (err) {
        errors.push(`incidents ${fixture.externalId}: ${err.message}`);
      }
    }

    updateMatch.run(
      fixture.homeGoals,
      fixture.awayGoals,
      firstTeam,
      firstPlayer,
      fixture.externalId,
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
    providers: ['bzzoiro'],
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
    enabled: isEnabled(),
    provider: 'Bzzoiro BSD (sports.bzzoiro.com)',
    providers: [{ name: 'bzzoiro', label: 'Bzzoiro BSD (sports.bzzoiro.com)' }],
    leagueId: cfg.leagueId,
    intervalMs: cfg.intervalMs,
    lastSync: getMeta(q, 'results_sync_last'),
    lastError: getMeta(q, 'results_sync_error') || null,
    lastSummary,
  };
}

function startScheduler(db) {
  if (!isEnabled()) {
    console.log('Results sync: disabled (set BZZOIRO_API_TOKEN to enable)');
    return;
  }

  const cfg = getConfig();
  const run = async () => {
    try {
      const result = await syncResults(db);
      console.log(
        `Results sync: updated ${result.updated}, skipped ${result.skipped}` +
          (result.error ? ` — ${result.error}` : '')
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
  syncResults,
  getSyncStatus,
  startScheduler,
};
