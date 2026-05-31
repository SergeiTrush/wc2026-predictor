const { prepare } = require('./sqlite-helpers');
const { mapApiTeamName } = require('./team-map');
const { isEnabled, apiFetch } = require('./bzzoiro-client');
const { findMatchForEvent } = require('./match-lookup');

const LIVE_STATUSES = new Set([
  'inprogress',
  '1st_half',
  'halftime',
  '2nd_half',
  'extra_time',
  'extratime',
  'penalties',
]);

let cache = {
  byMatchId: new Map(),
  at: 0,
};

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

async function refreshLiveScores(db) {
  const q = (sql) => prepare(db, sql);
  const byMatchId = new Map();

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

    const hasFinal =
      Number(match.is_finished) === 1 &&
      match.home_score != null &&
      match.away_score != null &&
      !LIVE_STATUSES.has(live.status);
    if (hasFinal) continue;

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
