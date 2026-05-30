const { prepare } = require('./sqlite-helpers');
const { mapApiTeamName } = require('./team-map');
const { isEnabled, apiFetch } = require('./bzzoiro-client');

const LIVE_STATUSES = new Set(['inprogress', '1st_half', 'halftime', '2nd_half', 'penalties']);

let cache = {
  byMatchId: new Map(),
  at: 0,
};

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

  const fuzzy = q(`SELECT * FROM matches WHERE home_team = ? AND away_team = ?`).all(home, away);
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
}

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
  if (!isEnabled()) {
    cache = { byMatchId: new Map(), at: Date.now() };
    return cache;
  }

  const q = (sql) => prepare(db, sql);
  const data = await apiFetch('/events/live/');
  const list = data.events || data.results || [];
  const byMatchId = new Map();

  for (const event of list) {
    const live = normalizeLiveEvent(event);
    if (!live) continue;

    const match = findMatch(q, {
      fixtureId: live.externalId,
      home: live.home,
      away: live.away,
      date: live.kickoffDate,
    });
    if (!match) continue;

    const hasFinal =
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
  if (Date.now() - cache.at < maxAgeMs) return cache;
  try {
    await refreshLiveScores(db);
  } catch (err) {
    console.warn('Live scores refresh:', err.message);
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
