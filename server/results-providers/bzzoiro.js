const { prepare } = require('../sqlite-helpers');
const { mapApiTeamName } = require('../team-map');
const { isEnabled, getConfig, apiFetch } = require('../bzzoiro-client');
const {
  isWc2026Event,
  matchKickoffInFuture,
  datesAlign,
  findMatchForEvent,
} = require('../match-lookup');
const {
  applyBzzoiroTeamPair,
  resolveAndApplyKnockoutTeams,
} = require('../resolve-knockout-teams');
const { resolveFirstScorerForFixture } = require('../first-scorer-sync');
const { isKnockoutMatch, isLiveExtraTime, resolveKnockoutPersistScores } = require('../../shared/live-score');

const FINISHED = new Set(['finished']);
const IN_PROGRESS = new Set([
  'inprogress',
  '1st_half',
  'halftime',
  '2nd_half',
  'extra_time',
  'extratime',
  'penalties',
]);

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

function hasStoredResult(match) {
  return match.home_score != null || match.away_score != null;
}

function clearMatchResult(q, matchId) {
  q(
    `UPDATE matches SET
       home_score = NULL,
       away_score = NULL,
       first_scorer_team = NULL,
       first_scorer_player = NULL,
       first_scorer_player_team = NULL,
       first_scorer_is_own_goal = NULL,
       final_home_score = NULL,
       final_away_score = NULL,
       is_finished = 0
     WHERE id = ?`
  ).run(matchId);
}

function linkExternalFixture(q, matchId, externalId) {
  if (!externalId) return;
  q('UPDATE matches SET external_fixture_id = ? WHERE id = ?').run(externalId, matchId);
}

async function resolveLeagueId() {
  const { leagueId } = getConfig();
  if (leagueId) return leagueId;

  const data = await apiFetch('/leagues/?limit=500');
  const leagues = data.results || [];

  const exact = leagues.find((l) => (l.name || '').trim().toLowerCase() === 'world cup 2026');
  if (exact) return exact.id;

  for (const league of leagues) {
    const name = (league.name || '').toLowerCase();
    if (name.includes('world cup') && name.includes('2026') && !name.includes('qualification')) {
      return league.id;
    }
  }
  for (const league of leagues) {
    const name = (league.name || '').toLowerCase();
    if (name.includes('world cup') && !name.includes('qualification')) return league.id;
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

function mapEvent(event) {
  const home = mapApiTeamName(event.home_team);
  const away = mapApiTeamName(event.away_team);
  if (!home || !away) return null;

  return {
    externalId: event.id,
    home,
    away,
    eventDate: event.event_date || '',
    status: String(event.status || '').toLowerCase(),
    homeGoals: event.home_score,
    awayGoals: event.away_score,
  };
}

async function maybeFetchFirstScorer(cfg, eventFetches, match, fixture, errors) {
  return resolveFirstScorerForFixture(match, fixture, {
    maxEventFetches: cfg.maxEventFetches,
    eventFetchesRef: eventFetches,
    errors,
  });
}

function runMatchScoreUpdate(updateStmt, updateExplicitStmt, scorer, args) {
  if (scorer.fetched) {
    updateExplicitStmt.run(...args);
  } else {
    updateStmt.run(...args);
  }
}

async function syncResults(db) {
  const q = (sql) => prepare(db, sql);
  const cfg = getConfig();

  if (!isEnabled()) {
    return { ok: false, error: 'BZZOIRO_API_TOKEN not configured', updated: 0, cleared: 0 };
  }

  let cleared = 0;
  let updated = 0;
  let liveUpdated = 0;
  let teamsUpdated = 0;
  let skipped = 0;
  let eventFetches = 0;
  const eventFetchesRef = { value: 0 };
  let fixturesSeen = 0;
  const errors = [];

  const updateMatchScores = q(
    `UPDATE matches SET
       home_score = ?,
       away_score = ?,
       final_home_score = ?,
       final_away_score = ?,
       first_scorer_team = COALESCE(?, first_scorer_team),
       first_scorer_player = COALESCE(?, first_scorer_player),
       first_scorer_player_team = COALESCE(?, first_scorer_player_team),
       first_scorer_is_own_goal = COALESCE(?, first_scorer_is_own_goal),
       external_fixture_id = ?,
       is_finished = ?
     WHERE id = ?`
  );

  const updateMatchScoresWithScorer = q(
    `UPDATE matches SET
       home_score = ?,
       away_score = ?,
       final_home_score = ?,
       final_away_score = ?,
       first_scorer_team = ?,
       first_scorer_player = ?,
       first_scorer_player_team = ?,
       first_scorer_is_own_goal = ?,
       external_fixture_id = ?,
       is_finished = ?
     WHERE id = ?`
  );

  const leagueId = await resolveLeagueId();
  if (!leagueId) {
    return {
      ok: false,
      error: 'World Cup 2026 league not found on Bzzoiro',
      updated: 0,
      cleared,
      skipped: 0,
      fixturesSeen: 0,
      leagueId: null,
      providers: ['bzzoiro'],
      errors: [],
    };
  }

  const rawEvents = await fetchEventsPaginated(`/events/?league_id=${leagueId}`);
  const events2026 = rawEvents.filter(isWc2026Event);
  fixturesSeen = events2026.length;

  for (const event of events2026) {
    const fixture = mapEvent(event);
    if (!fixture) {
      skipped += 1;
      continue;
    }

    const match = findMatchForEvent(q, {
      fixtureId: fixture.externalId,
      home: fixture.home,
      away: fixture.away,
      eventDate: fixture.eventDate,
    });
    if (!match) {
      skipped += 1;
      continue;
    }

    if (!datesAlign(match, fixture.eventDate)) {
      skipped += 1;
      continue;
    }

    linkExternalFixture(q, match.id, fixture.externalId);

    if (applyBzzoiroTeamPair(db, match.id, fixture.home, fixture.away, fixture.externalId)) {
      teamsUpdated += 1;
    }

    if (matchKickoffInFuture(match)) {
      // Keep manual/test results before kickoff — never touch on sync.
      continue;
    }

    if (IN_PROGRESS.has(fixture.status)) {
      if (fixture.homeGoals == null || fixture.awayGoals == null) {
        skipped += 1;
        continue;
      }

      const inExtraTime = isKnockoutMatch(match) && isLiveExtraTime({ status: fixture.status });
      const scorer = await maybeFetchFirstScorer(
        cfg,
        eventFetchesRef,
        match,
        { ...fixture, inExtraTime },
        errors
      );
      eventFetches = eventFetchesRef.value;

      const scores = resolveKnockoutPersistScores(
        match,
        fixture.homeGoals,
        fixture.awayGoals,
        inExtraTime
      );

      runMatchScoreUpdate(
        updateMatchScores,
        updateMatchScoresWithScorer,
        scorer,
        [
          scores.homeScore,
          scores.awayScore,
          scores.finalHomeScore,
          scores.finalAwayScore,
          scorer.firstTeam,
          scorer.firstPlayer,
          scorer.playerTeam,
          scorer.isOwnGoal,
          fixture.externalId,
          0,
          match.id,
        ]
      );
      liveUpdated += 1;
      continue;
    }

    if (FINISHED.has(fixture.status)) {
      if (fixture.homeGoals == null || fixture.awayGoals == null) {
        skipped += 1;
        continue;
      }

      const scorer = await maybeFetchFirstScorer(cfg, eventFetchesRef, match, fixture, errors);
      eventFetches = eventFetchesRef.value;

      const scores = resolveKnockoutPersistScores(
        match,
        fixture.homeGoals,
        fixture.awayGoals,
        false
      );

      runMatchScoreUpdate(
        updateMatchScores,
        updateMatchScoresWithScorer,
        scorer,
        [
          scores.homeScore,
          scores.awayScore,
          scores.finalHomeScore,
          scores.finalAwayScore,
          scorer.firstTeam,
          scorer.firstPlayer,
          scorer.playerTeam,
          scorer.isOwnGoal,
          fixture.externalId,
          1,
          match.id,
        ]
      );
      updated += 1;
      continue;
    }

    // notstarted / scheduled — keep any manual results unchanged
  }

  const internalTeams = resolveAndApplyKnockoutTeams(db);
  teamsUpdated += internalTeams.teamsUpdated;

  const summary = {
    ok: true,
    updated,
    liveUpdated,
    teamsUpdated,
    cleared,
    skipped,
    eventFetches,
    fixturesSeen,
    leagueId,
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
        `Results sync: updated ${result.updated}, live ${result.liveUpdated || 0}, teams ${result.teamsUpdated || 0}, cleared ${result.cleared || 0}, skipped ${result.skipped}` +
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
