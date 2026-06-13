const { prepare } = require('./sqlite-helpers');
const { mapApiTeamName } = require('./team-map');
const { isEnabled, apiFetch } = require('./bzzoiro-client');
const { findMatchForEvent } = require('./match-lookup');
const { resolveFirstScorerForFixture } = require('./first-scorer-sync');

const LIVE_STATUSES = new Set([
  'inprogress',
  '1st_half',
  'halftime',
  '2nd_half',
  'extra_time',
  'extratime',
  'penalties',
]);

const FINISHED_STATUSES = new Set(['finished', 'ended', 'ft', 'fulltime', 'full_time']);

let cache = {
  byMatchId: new Map(),
  at: 0,
};

const liveEventFetchesRef = { value: 0 };
const LIVE_MAX_INCIDENT_FETCHES = Number(process.env.LIVE_SCORES_MAX_INCIDENTS || 8);

function normalizeLiveEvent(event) {
  const home = mapApiTeamName(event.home_team);
  const away = mapApiTeamName(event.away_team);
  if (!home || !away) return null;
  if (event.home_score == null || event.away_score == null) return null;

  const status = event.status || 'inprogress';
  return {
    externalId: event.id,
    home,
    away,
    homeScore: Number(event.home_score),
    awayScore: Number(event.away_score),
    minute: event.current_minute ?? null,
    status,
    isLive: LIVE_STATUSES.has(status),
    kickoffDate: (event.event_date || '').slice(0, 10),
  };
}

const updateLiveMatchDb = (q) =>
  q(
    `UPDATE matches SET
       home_score = ?,
       away_score = ?,
       first_scorer_team = COALESCE(?, first_scorer_team),
       first_scorer_player = COALESCE(?, first_scorer_player),
       first_scorer_player_team = COALESCE(?, first_scorer_player_team),
       first_scorer_is_own_goal = COALESCE(?, first_scorer_is_own_goal),
       external_fixture_id = COALESCE(?, external_fixture_id)
     WHERE id = ? AND is_finished = 0 AND COALESCE(admin_cleared, 0) = 0`
  );

async function persistLiveMatchFromFeed(q, match, live) {
  if (Number(match.is_finished) === 1 || Number(match.admin_cleared) === 1) return;

  const fixture = {
    externalId: live.externalId,
    home: live.home,
    away: live.away,
    homeGoals: live.homeScore,
    awayGoals: live.awayScore,
    homeScore: live.homeScore,
    awayScore: live.awayScore,
  };

  const errors = [];
  const scorer = await resolveFirstScorerForFixture(match, fixture, {
    maxEventFetches: LIVE_MAX_INCIDENT_FETCHES,
    eventFetchesRef: liveEventFetchesRef,
    errors,
  });
  if (errors.length) {
    console.warn('Live first scorer:', errors[0]);
  }

  updateLiveMatchDb(q).run(
    live.homeScore,
    live.awayScore,
    scorer.firstTeam,
    scorer.firstPlayer,
    scorer.playerTeam,
    scorer.isOwnGoal,
    live.externalId,
    match.id
  );
}

async function refreshLiveScores(db) {
  const q = (sql) => prepare(db, sql);
  const byMatchId = new Map();
  liveEventFetchesRef.value = 0;

  if (!isEnabled()) {
    cache = { byMatchId, at: Date.now() };
    return cache;
  }

  const data = await apiFetch('/events/live/');
  const list = data.events || data.results || [];

  for (const event of list) {
    const live = normalizeLiveEvent(event);
    if (!live) continue;

    const match = findMatchForEvent(q, {
      fixtureId: live.externalId,
      home: live.home,
      away: live.away,
      eventDate: live.kickoffDate,
    });
    if (!match) continue;

    if (FINISHED_STATUSES.has(live.status)) {
      if (Number(match.is_finished) !== 1) {
        q(
          `UPDATE matches SET home_score = ?, away_score = ?, is_finished = 1 WHERE id = ?`
        ).run(live.homeScore, live.awayScore, match.id);
      }
      continue;
    }

    const hasFinal =
      Number(match.is_finished) === 1 &&
      match.home_score != null &&
      match.away_score != null &&
      !LIVE_STATUSES.has(live.status);
    if (hasFinal) continue;

    if (live.isLive && live.homeScore + live.awayScore >= 0) {
      try {
        await persistLiveMatchFromFeed(q, match, live);
      } catch (err) {
        console.warn(`Live DB persist match ${match.id}:`, err.message);
      }
    }

    byMatchId.set(match.id, {
      homeScore: live.homeScore,
      awayScore: live.awayScore,
      minute: live.minute,
      status: live.status,
      isLive: live.isLive,
    });
  }

  cache = { byMatchId, at: Date.now() };
  return cache;
}

async function refreshIfStale(db, maxAgeMs = 30000) {
  if (!isEnabled()) return cache;

  const stale = Date.now() - cache.at >= maxAgeMs;
  if (stale) {
    try {
      await refreshLiveScores(db);
    } catch (err) {
      console.warn('Live scores refresh:', err.message);
      cache = { byMatchId: new Map(), at: Date.now() };
    }
  }

  return cache;
}

function getLiveScoreForMatch(matchId) {
  const id = Number(matchId);
  return cache.byMatchId.get(id) || cache.byMatchId.get(matchId) || null;
}

function getLiveScoresCache() {
  return cache;
}

function startLiveScoresScheduler(db) {
  if (!isEnabled()) {
    console.log('Live scores: disabled (set BZZOIRO_API_TOKEN to enable)');
    return;
  }

  const intervalMs = Number(process.env.LIVE_SCORES_INTERVAL_MS || 60000);

  const run = async () => {
    try {
      const result = await refreshLiveScores(db);
      if (result.byMatchId.size) {
        console.log(`Live scores: ${result.byMatchId.size} in-play match(es)`);
      }
    } catch (err) {
      console.warn('Live scores sync failed:', err.message);
    }
  };

  setTimeout(run, 12000);
  setInterval(run, intervalMs);
  console.log(`Live scores: polling every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = {
  refreshLiveScores,
  refreshIfStale,
  getLiveScoresCache,
  getLiveScoreForMatch,
  startLiveScoresScheduler,
};
