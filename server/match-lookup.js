/** Strict match lookup — never fuzzy-match across different kickoff dates. */

const { isPlaceholderTeam } = require('./data/bracket-slots');

const KICKOFF_MATCH_MS = 5 * 60 * 1000;

function kickoffDate(iso) {
  return (iso || '').slice(0, 10);
}

function eventYear(eventDate) {
  return String(eventDate || '').slice(0, 4);
}

function isWc2026Event(event) {
  return eventYear(event.event_date) === '2026';
}

function matchKickoffInFuture(match) {
  const t = new Date(match.kickoff).getTime();
  return !Number.isNaN(t) && t > Date.now();
}

function datesAlign(match, eventDate) {
  return kickoffDate(match.kickoff) === kickoffDate(eventDate);
}

function findKnockoutByKickoff(q, eventDateIso) {
  const eventMs = new Date(eventDateIso).getTime();
  if (Number.isNaN(eventMs)) return null;

  const candidates = q(`SELECT * FROM matches WHERE stage != 'group'`).all();
  let best = null;
  let bestDelta = Infinity;

  for (const m of candidates) {
    const kickoffMs = new Date(m.kickoff).getTime();
    if (Number.isNaN(kickoffMs)) continue;
    const delta = Math.abs(kickoffMs - eventMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = m;
    }
  }

  if (best && bestDelta <= KICKOFF_MATCH_MS) return best;
  return null;
}

function findMatchForEvent(q, { fixtureId, home, away, eventDate }) {
  if (fixtureId) {
    const byId = q('SELECT * FROM matches WHERE external_fixture_id = ?').get(fixtureId);
    if (byId) return byId;
  }

  const date = kickoffDate(eventDate);
  if (home && away && date) {
    const byTeams = q(
      `SELECT * FROM matches
       WHERE home_team = ? AND away_team = ?
         AND substr(kickoff, 1, 10) = ?`
    ).get(home, away, date);
    if (byTeams) return byTeams;
  }

  if (
    home &&
    away &&
    eventDate &&
    !isPlaceholderTeam(home) &&
    !isPlaceholderTeam(away)
  ) {
    return findKnockoutByKickoff(q, eventDate);
  }

  return null;
}

module.exports = {
  kickoffDate,
  eventYear,
  isWc2026Event,
  matchKickoffInFuture,
  datesAlign,
  findKnockoutByKickoff,
  findMatchForEvent,
};
