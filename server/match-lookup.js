/** Strict match lookup — never fuzzy-match across different kickoff dates. */

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

function findMatchForEvent(q, { fixtureId, home, away, eventDate }) {
  if (fixtureId) {
    const byId = q('SELECT * FROM matches WHERE external_fixture_id = ?').get(fixtureId);
    if (byId) return byId;
  }

  const date = kickoffDate(eventDate);
  if (!home || !away || !date) return null;

  return (
    q(
      `SELECT * FROM matches
       WHERE home_team = ? AND away_team = ?
         AND substr(kickoff, 1, 10) = ?`
    ).get(home, away, date) || null
  );
}

module.exports = {
  kickoffDate,
  eventYear,
  isWc2026Event,
  matchKickoffInFuture,
  datesAlign,
  findMatchForEvent,
};
