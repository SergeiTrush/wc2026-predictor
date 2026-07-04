const fs = require('fs');
const envPath = require('path').join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const db = require('./db');
const predictionsSchemaOk = require('./db').predictionsSchemaOk;
const dbStartupInfo = require('./db').dbStartupInfo;
const { prepare, transaction } = require('./sqlite-helpers');
const { seedDatabase } = require('./seed');
const {
  totalMatchPoints,
  matchdayFromKickoff,
  breakdownMatchPoints,
  formatPointsBreakdown,
  leaderboardTiebreakCounts,
  compareLeaderboardRows,
  toScore,
  computeUnderdogBonus,
} = require('../shared/scoring');
const { scoringActualFromLive, liveScoreIsFinished, isKnockoutExtraTime } = require('../shared/live-score');
const {
  syncResultsFromApi,
  getSyncStatus,
  startResultsSyncScheduler,
  isEnabled: resultsSyncEnabled,
} = require('./sync-results');
const { isSquadEnabled, getLocalSquadsBulk, getTeamSquad, getMatchSquads } = require('./squad-service');
const { refreshIfStale, getLiveScoreForMatch, startLiveScoresScheduler } = require('./live-scores');
const {
  getSuggestionsMap,
  getSuggestionsForMatch,
  startFifaScoreSuggestionsScheduler,
} = require('./fifa-score-suggestions');
const { resolveAndApplyKnockoutTeams } = require('./resolve-knockout-teams');
const {
  enrichMatchForScoring,
  findPlayerSide,
  inferFirstScorerMeta,
  hydrateMatchScorerFromApi,
  needsScorerHydration,
  prepareMatchForScoringList,
  repairMatchRegulationScores,
  resolveScoringActual,
  storedRegulationLooksStale,
} = require('./scoring-actual');
const {
  GROUPS,
  GROUP_KEYS,
  KNOCKOUT_TREE,
  R32_THIRD_SLOTS,
  ROUND_ORDER,
  ROUND_LABELS,
  emptyBracketPicks,
  buildResolvedBracket,
  validateBracketPicks,
} = require('./bracket');

const q = (query) => prepare(db, query);

function finalScoreColumnsOk() {
  const cols = new Set(db.prepare('PRAGMA table_info(matches)').all().map((c) => c.name));
  return cols.has('final_home_score') && cols.has('final_away_score');
}

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'wc2026-dev-secret-change-in-production';
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let lastResultsSyncOnMatchesAt = 0;
const RESULTS_SYNC_ON_MATCHES_MS = Number(process.env.RESULTS_SYNC_ON_MATCHES_MS || 60000);

async function refreshResultsIfStale() {
  if (!resultsSyncEnabled()) return;
  if (Date.now() - lastResultsSyncOnMatchesAt < RESULTS_SYNC_ON_MATCHES_MS) return;
  try {
    await syncResultsFromApi(db);
    lastResultsSyncOnMatchesAt = Date.now();
  } catch (err) {
    console.warn('Results sync on /api/matches:', err.message);
  }
}

function inviteCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_ALPHABET[crypto.randomInt(0, INVITE_ALPHABET.length)];
  }
  return code;
}

if (process.env.NODE_ENV === 'production' && JWT_SECRET.includes('dev-secret')) {
  console.warn('WARNING: Set JWT_SECRET in production.');
}

const seedResult = seedDatabase(db);
if (seedResult.matchCount === 0) {
  console.warn('No matches in database — seed may have failed.');
} else if (seedResult.updated) {
  console.log(`WC 2026 schedule synced: ${seedResult.rowsUpdated} matches updated`);
}

const knockoutTeams = resolveAndApplyKnockoutTeams(db);
if (knockoutTeams.teamsUpdated) {
  console.log(`Knockout teams resolved: ${knockoutTeams.teamsUpdated} match(es)`);
}

{
  const info = dbStartupInfo();
  console.log(
    `SQLite database: ${info.dbPath}` +
    (info.onRender ? ` (persistent disk: ${info.persistent ? 'yes' : 'NO'})` : '') +
    `, users: ${info.userCount}`
  );
}

const app = express();
app.use(cors());
app.use(express.json());

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function isLeagueMember(leagueId, userId) {
  return q(
    'SELECT suspended FROM league_members WHERE league_id = ? AND user_id = ?'
  ).get(Number(leagueId), Number(userId));
}

function isMemberSuspended(member) {
  return Boolean(member && Number(member.suspended) !== 0);
}

function isActiveLeagueMember(leagueId, userId) {
  const member = isLeagueMember(leagueId, userId);
  if (!member || isMemberSuspended(member)) return null;
  return member;
}

function requireActiveLeagueMember(leagueId, userId, res) {
  const lid = Number(leagueId);
  const uid = Number(userId);
  if (!Number.isFinite(lid) || lid <= 0) {
    res.status(400).json({ error: 'Некорректная лига' });
    return null;
  }
  const member = isLeagueMember(lid, uid);
  if (!member) {
    res.status(403).json({ error: 'Вы не в этой лиге' });
    return null;
  }
  if (isMemberSuspended(member)) {
    res.status(403).json({ error: 'Вы отстранены от лиги' });
    return null;
  }
  return member;
}

function requireLeagueOwner(leagueId, userId, res) {
  if (!requireActiveLeagueMember(leagueId, userId, res)) return false;
  const league = q('SELECT owner_id FROM leagues WHERE id = ?').get(Number(leagueId));
  if (!league) {
    res.status(404).json({ error: 'Лига не найдена' });
    return false;
  }
  if (Number(league.owner_id) !== Number(userId)) {
    res.status(403).json({ error: 'Только владелец лиги может изменять настройки' });
    return false;
  }
  return true;
}

function requireLeagueIdQuery(rawLeagueId, userId, res) {
  if (rawLeagueId == null || rawLeagueId === '') return null;
  const lid = Number(rawLeagueId);
  if (!Number.isFinite(lid) || lid <= 0) {
    res.status(400).json({ error: 'Некорректная лига' });
    return false;
  }
  return requireActiveLeagueMember(lid, userId, res) ? lid : false;
}

function leagueDetailPayload(leagueId, userId) {
  const lid = Number(leagueId);
  const uid = Number(userId);
  const league = q(
    `SELECT l.id, l.name, l.code, l.owner_id, u.name AS owner_name
     FROM leagues l
     INNER JOIN users u ON u.id = l.owner_id
     WHERE l.id = ?`
  ).get(lid);
  if (!league) return null;
  const members = q(
    `SELECT u.id, u.name, lm.suspended, (l.owner_id = u.id) AS is_owner
     FROM users u
     INNER JOIN league_members lm ON lm.user_id = u.id
     INNER JOIN leagues l ON l.id = lm.league_id
     WHERE lm.league_id = ?
     ORDER BY u.name`
  ).all(lid);
  return {
    league: {
      ...league,
      is_owner: Number(league.owner_id) === uid,
    },
    members: members.map((m) => ({
      ...m,
      is_owner: !!m.is_owner,
      is_you: Number(m.id) === uid,
    })),
  };
}

function matchLockState(match) {
  const kickoff = new Date(match.kickoff).getTime();
  if (!Number.isNaN(kickoff) && kickoff <= Date.now()) {
    return { locked: true, lockReason: 'started' };
  }
  return { locked: false, lockReason: null };
}

function matchIsFinished(match) {
  return Number(match?.is_finished) === 1;
}

function parseIsFinishedFlag(body) {
  if (!body || !('isFinished' in body)) return 0;
  const v = body.isFinished;
  if (v === true || v === 1 || v === '1') return 1;
  return 0;
}

function matchHasStoredScore(match) {
  return match.home_score != null && match.away_score != null;
}

function matchHasResult(match) {
  return matchIsFinished(match) && matchHasStoredScore(match);
}

function matchHasLiveManualScore(match) {
  return matchHasStoredScore(match) && !matchIsFinished(match);
}

function matchIsInPlay(match, liveScore = undefined) {
  if (matchHasResult(match)) return false;
  const feed = getLiveScoreForMatch(match.id);
  if (liveScoreIsFinished(feed)) return false;
  const ls = liveScore !== undefined ? liveScore : feed;
  if (ls?.isLive) return true;
  return false;
}

function manualLiveScoreFromMatch(match) {
  if (!matchHasLiveManualScore(match)) return null;
  return {
    homeScore: match.home_score,
    awayScore: match.away_score,
    minute: null,
    status: 'inprogress',
    isLive: true,
    manual: true,
  };
}

function resolveLiveScoreForMatch(match) {
  if (matchHasResult(match)) return null;
  const feed = getLiveScoreForMatch(match.id);
  if (feed) {
    if (liveScoreIsFinished(feed)) return null;
    return feed;
  }
  return manualLiveScoreFromMatch(match);
}

function matchKickoffPassed(match) {
  const kickoff = new Date(match.kickoff).getTime();
  return !Number.isNaN(kickoff) && kickoff <= Date.now();
}

function liveScoreAsResult(match, liveScore) {
  return scoringActualFromLive(match, liveScore);
}

/** Final DB result, or provisional score from live feed when kickoff has passed. */
function computeUnderdogBonusFromActual(pred, actual, match, suggestionsMap) {
  const suggestions = getSuggestionsForMatch(match, suggestionsMap);
  return computeUnderdogBonus(pred, actual, suggestions);
}

function underdogBonusForLeaderboard(pred, match, liveScore, suggestionsMap) {
  const resolved = resolveLeaderboardMatchActual(match, liveScore);
  if (!resolved) return 0;
  const suggestions = getSuggestionsForMatch(match, suggestionsMap);
  return computeUnderdogBonus(pred, resolved.actual, suggestions);
}

function resolveLeaderboardMatchActual(match, liveScore) {
  const actual = resolveScoringActual(match, liveScore, {
    matchHasResult,
    matchHasLiveManualScore,
  });
  if (!actual) return null;

  const feed = liveScore ?? getLiveScoreForMatch(match.id);
  const provisional =
    !matchHasResult(match) &&
    feed &&
    !liveScoreIsFinished(feed) &&
    !isKnockoutExtraTime(match, feed);

  return { actual, provisional };
}

function persistHydratedScorer(matchId, match) {
  q(
    `UPDATE matches SET
       first_scorer_team = ?,
       first_scorer_player = ?,
       first_scorer_player_team = ?,
       first_scorer_is_own_goal = ?
     WHERE id = ? AND is_finished = 0 AND COALESCE(admin_cleared, 0) = 0`
  ).run(
    match.first_scorer_team,
    match.first_scorer_player,
    match.first_scorer_player_team,
    match.first_scorer_is_own_goal,
    matchId
  );
}

function persistRegulationScores(matchId, home, away) {
  q(
    `UPDATE matches SET home_score = ?, away_score = ? WHERE id = ? AND is_finished = 0 AND COALESCE(admin_cleared, 0) = 0`
  ).run(home, away, matchId);
}

async function ensureMatchScorersHydrated(matches) {
  for (const match of matches) {
    const liveScore = getLiveScoreForMatch(match.id);
    const repaired = await repairMatchRegulationScores(match, liveScore);
    if (
      toScore(repaired.home_score) !== toScore(match.home_score) ||
      toScore(repaired.away_score) !== toScore(match.away_score)
    ) {
      Object.assign(match, repaired);
      try {
        persistRegulationScores(match.id, repaired.home_score, repaired.away_score);
      } catch (err) {
        console.warn(`Persist regulation match ${match.id}:`, err.message);
      }
    }

    if (!needsScorerHydration(match)) continue;
    const before = JSON.stringify([
      match.first_scorer_team,
      match.first_scorer_player,
      match.first_scorer_player_team,
      match.first_scorer_is_own_goal,
    ]);
    const hydrated = await hydrateMatchScorerFromApi(match, liveScore);
    const after = JSON.stringify([
      hydrated.first_scorer_team,
      hydrated.first_scorer_player,
      hydrated.first_scorer_player_team,
      hydrated.first_scorer_is_own_goal,
    ]);
    if (after !== before) {
      Object.assign(match, hydrated);
      if (hydrated.first_scorer_player || hydrated.first_scorer_team) {
        try {
          persistHydratedScorer(match.id, hydrated);
        } catch (err) {
          console.warn(`Persist scorer match ${match.id}:`, err.message);
        }
      }
    }
  }
}

function scheduleMatchScorersHydration(matches) {
  const pending = matches.filter(
    (m) => needsScorerHydration(m) || storedRegulationLooksStale(m)
  );
  if (!pending.length) return;
  setImmediate(() => {
    ensureMatchScorersHydrated(pending).catch((err) => {
      console.warn('Background scorer hydration:', err.message);
    });
  });
}

function loadLeagueMatchesContext(leagueId, userId) {
  const lid = Number(leagueId);
  const uid = Number(userId);

  const userPreds = q('SELECT * FROM predictions WHERE league_id = ? AND user_id = ?').all(lid, uid);
  const userPredByMatchId = new Map(userPreds.map((p) => [Number(p.match_id), p]));

  const friendCounts = q(
    `SELECT p.match_id, COUNT(*) AS cnt
     FROM predictions p
     INNER JOIN league_members lm
       ON lm.user_id = p.user_id AND lm.league_id = p.league_id AND lm.suspended = 0
     WHERE p.league_id = ? AND p.user_id != ?
     GROUP BY p.match_id`
  ).all(lid, uid);
  const friendsCountByMatchId = new Map(
    friendCounts.map((r) => [Number(r.match_id), Number(r.cnt)])
  );

  return { userPredByMatchId, friendsCountByMatchId };
}

function predUserMatchKey(userId, matchId) {
  return `${Number(userId)}:${Number(matchId)}`;
}

function loadLeaguePredictionsMap(leagueId) {
  const rows = q('SELECT * FROM predictions WHERE league_id = ?').all(Number(leagueId));
  const byUserMatch = new Map();
  for (const pred of rows) {
    byUserMatch.set(predUserMatchKey(pred.user_id, pred.match_id), pred);
  }
  return byUserMatch;
}

function loadBracketCompleteByUserId(leagueId) {
  const rows = q('SELECT user_id, picks FROM bracket_picks WHERE league_id = ?').all(Number(leagueId));
  const byUserId = new Map();
  for (const row of rows) {
    let complete = 0;
    if (row.picks) {
      try {
        const picks = JSON.parse(row.picks);
        if (picks.champion && Object.keys(picks.winners || {}).length >= 31) complete = 1;
      } catch {
        /* ignore malformed bracket JSON */
      }
    }
    byUserId.set(Number(row.user_id), complete);
  }
  return byUserId;
}

function prepareScorableLeaderboardMatches(scopeMatches) {
  const prepared = scopeMatches.map((match) => prepareMatchForScoringList(match));
  const scorableMatches = [];
  const liveScoreByMatchId = new Map();

  for (const match of prepared) {
    const liveScore = getLiveScoreForMatch(match.id);
    liveScoreByMatchId.set(Number(match.id), liveScore);
    if (isLeaderboardScorableMatch(match, liveScore)) {
      scorableMatches.push(match);
    }
  }

  scheduleMatchScorersHydration(scorableMatches);
  return { scorableMatches, liveScoreByMatchId };
}

function computeMemberLeaderboardStats(
  member,
  scorableMatches,
  liveScoreByMatchId,
  predictionsByUserMatch,
  suggestionsMap
) {
  let total = 0;
  let provisionalPoints = 0;
  let scoredMatches = 0;
  let correctResults = 0;
  let correctFirstTeam = 0;
  let correctFirstPlayer = 0;

  for (const match of scorableMatches) {
    const pred = predictionsByUserMatch.get(predUserMatchKey(member.id, match.id));
    if (!pred) continue;
    const liveScore = liveScoreByMatchId.get(Number(match.id));
    const bonus = underdogBonusForLeaderboard(pred, match, liveScore, suggestionsMap);
    const { points, provisional, tiebreak } = matchPointsForLeaderboard(
      pred,
      match,
      liveScore,
      bonus
    );
    total += points;
    if (provisional) provisionalPoints += points;
    scoredMatches += 1;
    if (tiebreak) {
      correctResults += tiebreak.correctResults;
      correctFirstTeam += tiebreak.correctFirstTeam;
      correctFirstPlayer += tiebreak.correctFirstPlayer;
    }
  }

  return {
    total,
    provisionalPoints,
    scoredMatches,
    correctResults,
    correctFirstTeam,
    correctFirstPlayer,
  };
}

function matchPointsForLeaderboard(pred, match, liveScore, underdogBonus = 0) {
  const opts = { underdogBonus };
  const resolved = resolveLeaderboardMatchActual(match, liveScore);
  if (!resolved) {
    if (!matchKickoffPassed(match)) {
      return { points: 0, provisional: false, tiebreak: null };
    }
    return { points: 0, provisional: false, tiebreak: null };
  }
  return {
    points: breakdownMatchPoints(pred, resolved.actual, opts).total,
    provisional: resolved.provisional,
    tiebreak: leaderboardTiebreakCounts(pred, resolved.actual),
  };
}

function matchesForLeaderboardScope(selectedMatchday) {
  if (selectedMatchday) {
    return q(
      `SELECT * FROM matches
       WHERE COALESCE(matchday, substr(kickoff, 1, 10)) = ?`
    ).all(selectedMatchday);
  }
  return q('SELECT * FROM matches').all();
}

function isLeaderboardScorableMatch(match, liveScore) {
  if (matchHasResult(match)) return true;
  if (matchHasLiveManualScore(match)) return true;
  if (!matchKickoffPassed(match)) return false;
  return liveScoreAsResult(match, liveScore) != null;
}

/** Matches UI: `.live-score-bar` (result) or `.live-score-pending` (kickoff passed, no result yet). */
function isMatchLiveScoreBarVisible(match) {
  const hasResult = matchHasResult(match);
  return hasResult || matchHasLiveManualScore(match) || matchLockState(match).locked;
}

function matchdayKey(match) {
  return match.matchday || matchdayFromKickoff(match.kickoff);
}

function getBoosterMatchForMatchday(leagueId, userId, day) {
  const row = q(
    `SELECT p.match_id FROM predictions p
     INNER JOIN matches m ON m.id = p.match_id
     WHERE p.league_id = ? AND p.user_id = ? AND p.booster = 1
       AND COALESCE(m.matchday, substr(m.kickoff, 1, 10)) = ?
     LIMIT 1`
  ).get(leagueId, userId, day);
  if (!row) return null;
  return q('SELECT * FROM matches WHERE id = ?').get(row.match_id);
}

function isBoosterLockedForMatchday(leagueId, userId, day) {
  const match = getBoosterMatchForMatchday(leagueId, userId, day);
  if (!match) return false;
  return isMatchLiveScoreBarVisible(match);
}

function clearBoostersForMatchday(leagueId, userId, day) {
  const rows = q(
    `SELECT p.match_id FROM predictions p
     INNER JOIN matches m ON m.id = p.match_id
     WHERE p.league_id = ? AND p.user_id = ? AND p.booster = 1
       AND COALESCE(m.matchday, substr(m.kickoff, 1, 10)) = ?`
  ).all(leagueId, userId, day);
  for (const row of rows) {
    const m = q('SELECT * FROM matches WHERE id = ?').get(row.match_id);
    if (isMatchLiveScoreBarVisible(m)) continue;
    q('UPDATE predictions SET booster = 0 WHERE league_id = ? AND user_id = ? AND match_id = ?').run(
      leagueId,
      userId,
      row.match_id
    );
  }
}

function leagueMemberIds(leagueId) {
  return q(
    `SELECT user_id FROM league_members WHERE league_id = ? AND suspended = 0`
  )
    .all(leagueId)
    .map((r) => r.user_id);
}

function leaguePredictionsForMatch(leagueId, matchId) {
  const ids = leagueMemberIds(leagueId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return q(
    `SELECT * FROM predictions WHERE league_id = ? AND match_id = ? AND user_id IN (${placeholders})`
  ).all(leagueId, matchId, ...ids);
}

function friendPredictionsForMatch(leagueId, matchId, userId, match, liveScore = null, suggestionsMap = null) {
  if (!isMatchLiveScoreBarVisible(match)) return null;

  const rows = q(
    `SELECT u.id AS user_id, u.name, p.home_pred, p.away_pred, p.first_team, p.first_player, p.booster
     FROM predictions p
     INNER JOIN users u ON u.id = p.user_id
     INNER JOIN league_members lm ON lm.user_id = u.id AND lm.league_id = p.league_id AND lm.suspended = 0
     WHERE p.league_id = ? AND p.match_id = ? AND p.user_id != ?
       AND p.home_pred IS NOT NULL AND p.away_pred IS NOT NULL
     ORDER BY u.name COLLATE NOCASE`
  ).all(leagueId, matchId, userId);

  const feed = liveScore ?? getLiveScoreForMatch(match.id);
  const scoreSource = resolveScoringActual(match, feed, {
    matchHasResult: matchHasResult(match),
    matchHasLiveManualScore,
  });
  const resolved = resolveLeaderboardMatchActual(match, liveScore);
  const suggestions = suggestionsMap ? getSuggestionsForMatch(match, suggestionsMap) : null;

  return rows.map((row) => {
    const pred = {
      home_pred: row.home_pred,
      away_pred: row.away_pred,
      first_team: row.first_team,
      first_player: row.first_player,
      booster: row.booster,
    };
    let points = null;
    let pointsDetail = null;
    let provisional = false;
    if (scoreSource) {
      const underdogBonus = suggestions ? computeUnderdogBonus(pred, scoreSource, suggestions) : 0;
      const raw = breakdownMatchPoints(pred, scoreSource, { underdogBonus });
      points = raw.total;
      pointsDetail = formatPointsBreakdown(raw);
      provisional = resolved?.provisional ?? false;
    }
    return {
      userId: row.user_id,
      name: row.name,
      home_pred: row.home_pred,
      away_pred: row.away_pred,
      first_team: row.first_team,
      first_player: row.first_player,
      booster: !!row.booster,
      points,
      pointsDetail,
      provisional,
    };
  });
}

// ——— Auth ———
app.post('/api/auth/register', (req, res) => {
  const { name, password } = req.body;
  if (!name?.trim() || !password || password.length < 4) {
    return res.status(400).json({ error: 'Имя и пароль (мин. 4 символа) обязательны' });
  }
  const trimmed = name.trim();
  if (!/^[a-zA-Z0-9 ._'-]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Имя должно содержать только латинские символы' });
  }
  if (q('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(trimmed)) {
    return res.status(409).json({ error: 'Имя уже занято' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = q('INSERT INTO users (name, password_hash) VALUES (?, ?)').run(trimmed, hash);
  const token = jwt.sign({ id: result.lastInsertRowid, name: trimmed }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: result.lastInsertRowid, name: trimmed } });
});

app.post('/api/auth/login', (req, res) => {
  const { name, password } = req.body;
  const user = q('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(name?.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = q('SELECT id, name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.patch('/api/auth/me', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Имя обязательно' });
  }
  const trimmed = name.trim();
  const taken = q('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?').get(
    trimmed,
    req.user.id
  );
  if (taken) {
    return res.status(409).json({ error: 'Имя уже занято' });
  }
  q('UPDATE users SET name = ? WHERE id = ?').run(trimmed, req.user.id);
  const user = { id: req.user.id, name: trimmed };
  const token = jwt.sign({ id: user.id, name: trimmed }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ user, token });
});

// ——— Leagues ———
app.get('/api/leagues', authMiddleware, (req, res) => {
  const leagues = q(
    `SELECT l.id, l.name, l.code, l.owner_id, u.name AS owner_name,
            (SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) AS member_count,
            (l.owner_id = ?) AS is_owner
     FROM leagues l
     INNER JOIN league_members m ON m.league_id = l.id AND m.user_id = ? AND m.suspended = 0
     INNER JOIN users u ON u.id = l.owner_id
     ORDER BY l.created_at DESC`
  ).all(req.user.id, req.user.id);
  res.json({
    leagues: leagues.map((l) => ({
      ...l,
      is_owner: !!l.is_owner,
    })),
  });
});

app.get('/api/leagues/:id', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;

  const userId = Number(req.user.id);
  const league = q(
    `SELECT l.id, l.name, l.code, l.owner_id, u.name AS owner_name,
            (l.owner_id = ?) AS is_owner
     FROM leagues l
     INNER JOIN users u ON u.id = l.owner_id
     WHERE l.id = ?`
  ).get(userId, leagueId);
  if (!league) return res.status(404).json({ error: 'Лига не найдена' });

  const isOwner = Number(league.owner_id) === userId;
  const response = {
    league: {
      ...league,
      is_owner: isOwner,
    },
  };

  if (isOwner) {
    const payload = leagueDetailPayload(leagueId, userId);
    if (payload?.members) response.members = payload.members;
  }

  res.json(response);
});

app.get('/api/leagues/:id/settings', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireLeagueOwner(leagueId, req.user.id, res)) return;
  const payload = leagueDetailPayload(leagueId, req.user.id);
  if (!payload) return res.status(404).json({ error: 'Лига не найдена' });
  res.json(payload);
});

app.patch('/api/leagues/:id', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireLeagueOwner(leagueId, req.user.id, res)) return;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  q('UPDATE leagues SET name = ? WHERE id = ?').run(name.trim(), leagueId);
  res.json({ league: q('SELECT id, name, code, owner_id FROM leagues WHERE id = ?').get(leagueId) });
});

app.delete('/api/leagues/:id', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireLeagueOwner(leagueId, req.user.id, res)) return;
  q('DELETE FROM leagues WHERE id = ?').run(leagueId);
  res.json({ ok: true });
});

app.post('/api/leagues', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название лиги обязательно' });
  let code;
  for (let i = 0; i < 10; i++) {
    code = inviteCode();
    if (!q('SELECT id FROM leagues WHERE code = ?').get(code)) break;
  }
  const leagueId = transaction(db, () => {
    const r = q('INSERT INTO leagues (name, code, owner_id) VALUES (?, ?, ?)').run(
      name.trim(),
      code,
      req.user.id
    );
    q('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)').run(
      r.lastInsertRowid,
      req.user.id
    );
    return r.lastInsertRowid;
  });
  res.status(201).json({ league: q('SELECT id, name, code, owner_id FROM leagues WHERE id = ?').get(leagueId) });
});

app.post('/api/leagues/join', authMiddleware, (req, res) => {
  const code = req.body.code?.trim().toUpperCase();
  const league = q('SELECT * FROM leagues WHERE code = ?').get(code);
  if (!league) return res.status(404).json({ error: 'Лига не найдена' });
  const existing = isLeagueMember(league.id, req.user.id);
  if (isMemberSuspended(existing)) {
    return res.status(403).json({ error: 'Вы отстранены от этой лиги' });
  }
  if (!existing) {
    q('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)').run(league.id, req.user.id);
  }
  res.json({ league: { id: league.id, name: league.name, code: league.code } });
});

app.post('/api/leagues/:id/members/:userId/suspend', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!requireLeagueOwner(leagueId, req.user.id, res)) return;
  const row = q('SELECT suspended FROM league_members WHERE league_id = ? AND user_id = ?').get(
    leagueId,
    userId
  );
  if (!row) return res.status(404).json({ error: 'Участник не найден' });
  const league = q('SELECT owner_id FROM leagues WHERE id = ?').get(leagueId);
  if (league?.owner_id === userId) {
    return res.status(400).json({ error: 'Нельзя отстранить владельца лиги' });
  }
  const next = row.suspended ? 0 : 1;
  q('UPDATE league_members SET suspended = ? WHERE league_id = ? AND user_id = ?').run(
    next,
    leagueId,
    userId
  );
  res.json({ suspended: next === 1 });
});

app.get('/api/bracket/template', authMiddleware, (_req, res) => {
  res.json({
    groups: GROUPS,
    groupKeys: GROUP_KEYS,
    knockout: KNOCKOUT_TREE.map((m) => ({
      id: m.id,
      round: m.round,
      label: ROUND_LABELS[m.round],
    })),
    thirdSlots: R32_THIRD_SLOTS,
    roundOrder: ROUND_ORDER,
    roundLabels: ROUND_LABELS,
  });
});

app.get('/api/leagues/:id/bracket', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;
  const row = q('SELECT picks FROM bracket_picks WHERE league_id = ? AND user_id = ?').get(
    leagueId,
    req.user.id
  );
  let picks = emptyBracketPicks();
  if (row?.picks) {
    try {
      picks = { ...picks, ...JSON.parse(row.picks) };
    } catch {
      /* ignore */
    }
  }
  const resolved = buildResolvedBracket(picks);
  const matches = Object.values(resolved);
  res.json({ picks, resolved: matches, groups: GROUPS, thirdSlots: R32_THIRD_SLOTS });
});

app.put('/api/leagues/:id/bracket', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;

  const picks = req.body.picks || req.body;
  if (picks.advancingThirds?.length === 8 && !Object.keys(picks.thirdSlotTeams || {}).length) {
    picks.thirdSlotTeams = {};
    R32_THIRD_SLOTS.forEach((slot, i) => {
      picks.thirdSlotTeams[slot] = picks.advancingThirds[i];
    });
  }
  if (picks.winners?.FINAL) {
    picks.champion = picks.winners.FINAL;
  }

  const strict = req.query.strict === '1';
  if (strict) {
    const errors = validateBracketPicks(picks);
    if (errors.length) return res.status(400).json({ error: errors[0], errors });
  }

  q(
    `INSERT INTO bracket_picks (league_id, user_id, picks, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(league_id, user_id) DO UPDATE SET
       picks = excluded.picks,
       updated_at = datetime('now')`
  ).run(leagueId, req.user.id, JSON.stringify(picks));

  res.json({ picks, resolved: Object.values(buildResolvedBracket(picks)) });
});

app.get('/api/leagues/:id/leaderboard', authMiddleware, async (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;
  const selectedMatchday = req.query.matchday ? String(req.query.matchday) : null;

  refreshIfStale(db).catch(() => {});
  refreshResultsIfStale().catch(() => {});

  const members = q(
    `SELECT u.id, u.name, (l.owner_id = u.id) AS is_owner
     FROM users u
     INNER JOIN league_members lm ON lm.user_id = u.id
     INNER JOIN leagues l ON l.id = lm.league_id
     WHERE lm.league_id = ? AND lm.suspended = 0
     ORDER BY u.name`
  ).all(leagueId);

  const scopeMatches = matchesForLeaderboardScope(selectedMatchday);
  const { scorableMatches, liveScoreByMatchId } = prepareScorableLeaderboardMatches(scopeMatches);
  const predictionsByUserMatch = loadLeaguePredictionsMap(leagueId);
  const bracketCompleteByUserId = loadBracketCompleteByUserId(leagueId);
  const suggestionsMap = await getSuggestionsMap();

  const leaderboard = members.map((member) => {
    const stats = computeMemberLeaderboardStats(
      member,
      scorableMatches,
      liveScoreByMatchId,
      predictionsByUserMatch,
      suggestionsMap
    );
    return {
      userId: member.id,
      name: member.name,
      isOwner: !!member.is_owner,
      points: stats.total,
      matchPoints: stats.total,
      provisionalPoints: stats.provisionalPoints,
      hasProvisional: stats.provisionalPoints > 0,
      scoredMatches: stats.scoredMatches,
      totalMatches: scorableMatches.length,
      bracketComplete: bracketCompleteByUserId.get(Number(member.id)) || 0,
      correctResults: stats.correctResults,
      correctFirstTeam: stats.correctFirstTeam,
      correctFirstPlayer: stats.correctFirstPlayer,
    };
  });

  leaderboard.sort(compareLeaderboardRows);
  res.json({ leaderboard });
});

app.get('/api/leagues/:id/users/:userId/matchday-points', authMiddleware, async (req, res) => {
  const leagueId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;

  const targetMember = q(
    'SELECT 1 AS ok FROM league_members WHERE league_id = ? AND user_id = ? AND suspended = 0'
  ).get(leagueId, userId);
  if (!targetMember) {
    return res.status(404).json({ error: 'Участник не найден в этой лиге' });
  }

  refreshIfStale(db).catch(() => {});
  refreshResultsIfStale().catch(() => {});

  const days = q(
    `SELECT DISTINCT COALESCE(matchday, substr(kickoff, 1, 10)) AS day
     FROM matches
     ORDER BY day`
  ).all();

  const allMatches = q('SELECT * FROM matches ORDER BY kickoff ASC').all();
  const matchesByDay = new Map();
  const liveScoreByMatchId = new Map();
  const scorableByDay = new Map();

  for (const raw of allMatches) {
    const match = prepareMatchForScoringList(raw);
    const day = matchdayKey(match);
    if (!matchesByDay.has(day)) matchesByDay.set(day, []);
    matchesByDay.get(day).push(match);

    const liveScore = getLiveScoreForMatch(match.id);
    liveScoreByMatchId.set(Number(match.id), liveScore);
    if (isLeaderboardScorableMatch(match, liveScore)) {
      if (!scorableByDay.has(day)) scorableByDay.set(day, []);
      scorableByDay.get(day).push(match);
    }
  }

  scheduleMatchScorersHydration([].concat(...scorableByDay.values()));

  const predictionsByMatchId = new Map(
    q('SELECT * FROM predictions WHERE league_id = ? AND user_id = ?')
      .all(leagueId, userId)
      .map((pred) => [Number(pred.match_id), pred])
  );
  const suggestionsMap = await getSuggestionsMap();

  const pointsByDay = {};
  for (const row of days) {
    const day = row.day;
    const scorableMatches = scorableByDay.get(day) || [];
    let points = 0;
    let provisionalPoints = 0;
    let scoredMatches = 0;

    for (const match of scorableMatches) {
      const pred = predictionsByMatchId.get(Number(match.id));
      if (!pred) continue;
      const liveScore = liveScoreByMatchId.get(Number(match.id));
      const bonus = underdogBonusForLeaderboard(pred, match, liveScore, suggestionsMap);
      const result = matchPointsForLeaderboard(pred, match, liveScore, bonus);
      points += result.points;
      if (result.provisional) provisionalPoints += result.points;
      scoredMatches += 1;
    }

    pointsByDay[day] = {
      points,
      provisionalPoints,
      hasProvisional: provisionalPoints > 0,
      scoredMatches,
      totalMatches: scorableMatches.length,
    };
  }

  res.json({ userId, pointsByDay });
});

// ——— Matches ———
app.get('/api/matches', authMiddleware, async (req, res) => {
  const { stage, group, matchday, leagueId, all } = req.query;
  const returnAll = all === '1' || all === 'true';
  let query = 'SELECT * FROM matches WHERE 1=1';
  const params = [];
  if (stage) {
    query += ' AND stage = ?';
    params.push(stage);
  }
  if (group) {
    query += ' AND group_name = ?';
    params.push(group);
  }
  if (matchday) {
    query += ' AND COALESCE(matchday, substr(kickoff, 1, 10)) = ?';
    params.push(matchday);
  } else if (!returnAll && !stage && !group) {
    query += ` AND kickoff >= datetime('now', '-1 day')`;
  }
  query += ' ORDER BY kickoff ASC';
  if (!matchday && !stage && !group && !returnAll) {
    query += ' LIMIT 48';
  }
  // Auto-initialize scores to 0:0 for matches that have started but have no score yet.
  // Skips matches where admin explicitly cleared the result (admin_cleared = 1).
  initStartedMatchScores();

  const matches = q(query).all(...params);
  const bulkLoad = returnAll || matches.length > 24;

  if (bulkLoad) {
    refreshIfStale(db).catch(() => {});
    refreshResultsIfStale().catch(() => {});
  } else {
    await refreshIfStale(db);
    await refreshResultsIfStale();
  }

  for (let i = 0; i < matches.length; i++) {
    matches[i] = prepareMatchForScoringList(matches[i]);
  }
  scheduleMatchScorersHydration(matches);

  const scoreSuggestionsByKey = await getSuggestionsMap();

  const lid = requireLeagueIdQuery(leagueId, req.user.id, res);
  if (lid === false) return;

  const isMember = lid ? !!isActiveLeagueMember(lid, req.user.id) : false;
  const leagueCtx =
    lid && isMember ? loadLeagueMatchesContext(lid, req.user.id) : null;

  const enriched = matches.map((m) => {
    let prediction =
      leagueCtx ? leagueCtx.userPredByMatchId.get(Number(m.id)) || null : null;
    const friendsPredicted = leagueCtx
      ? leagueCtx.friendsCountByMatchId.get(Number(m.id)) || 0
      : 0;
    let pointsDetail = null;
    const liveScore = resolveLiveScoreForMatch(m);
    const inPlay = matchIsInPlay(m, liveScore);
    const finished = matchIsFinished(m);
    const hasResult = finished && matchHasStoredScore(m);
    if (leagueCtx && prediction && (hasResult || matchHasLiveManualScore(m) || liveScore)) {
      const actual = resolveScoringActual(m, liveScore, {
        matchHasResult,
        matchHasLiveManualScore,
      });
      if (actual) {
        const underdogBonus = computeUnderdogBonusFromActual(prediction, actual, m, scoreSuggestionsByKey);
        const raw = breakdownMatchPoints(prediction, actual, { underdogBonus });
        pointsDetail = formatPointsBreakdown(raw);
        if (underdogBonus) prediction = { ...prediction, underdogBonus };
      }
    }
    const baseLock = matchLockState(m);
    const locked = baseLock.locked || !!liveScore;
    const lockReason = locked ? baseLock.lockReason || (liveScore ? 'started' : null) : null;
    const scorerMeta = inferFirstScorerMeta(m);
    const firstScorerPlayerTeam =
      scorerMeta.first_scorer_player_team ?? m.first_scorer_player_team ?? null;
    const firstScorerIsOwnGoalFlag =
      scorerMeta.first_scorer_is_own_goal ?? m.first_scorer_is_own_goal ?? null;
    return {
      ...m,
      first_scorer_player_team: firstScorerPlayerTeam,
      first_scorer_is_own_goal: firstScorerIsOwnGoalFlag,
      matchday: m.matchday || matchdayFromKickoff(m.kickoff),
      locked,
      lockReason,
      prediction,
      friendsPredicted,
      friendPredictions: null,
      hasResult,
      isFinished: finished,
      isLive: inPlay,
      hasLiveScore: !!liveScore && !liveScoreIsFinished(liveScore),
      hasLiveManualScore: matchHasLiveManualScore(m),
      pointsDetail,
      liveScore,
      firstScorerIsOwnGoal: Number(firstScorerIsOwnGoalFlag) === 1,
      suggestedScores: getSuggestionsForMatch(m, scoreSuggestionsByKey),
    };
  });

  res.json({ matches: enriched });
});

async function sendFriendPredictions(req, res, leagueId, matchId) {
  const lid = Number(leagueId);
  const mid = Number(matchId);
  if (!requireActiveLeagueMember(lid, req.user.id, res)) return;

  const raw = q('SELECT * FROM matches WHERE id = ?').get(mid);
  if (!raw) return res.status(404).json({ error: 'Матч не найден' });

  const match = prepareMatchForScoringList(raw);
  if (!isMatchLiveScoreBarVisible(match)) {
    return res.status(403).json({
      error: 'Прогнозы друзей доступны после начала матча',
    });
  }

  refreshIfStale(db).catch(() => {});
  refreshResultsIfStale().catch(() => {});
  scheduleMatchScorersHydration([match]);

  const hasResult = matchHasResult(match);
  const liveScore = resolveLiveScoreForMatch(match);
  const suggestionsMap = await getSuggestionsMap();
  const predictions = friendPredictionsForMatch(lid, mid, req.user.id, match, liveScore, suggestionsMap);

  res.json({
    predictions,
    match: {
      id: match.id,
      home_team: match.home_team,
      away_team: match.away_team,
      home_score: match.home_score,
      away_score: match.away_score,
      final_home_score: match.final_home_score,
      final_away_score: match.final_away_score,
      hasResult,
      isFinished: matchIsFinished(match),
      liveScore,
      stage: match.stage,
      kickoff: match.kickoff,
      first_scorer_team: match.first_scorer_team,
      first_scorer_player: match.first_scorer_player,
      first_scorer_player_team: match.first_scorer_player_team,
      first_scorer_is_own_goal: match.first_scorer_is_own_goal,
      suggestedScores: getSuggestionsForMatch(match, suggestionsMap),
    },
  });
}

app.get('/api/matches/:matchId/friend-predictions', authMiddleware, (req, res) => {
  const lid = requireLeagueIdQuery(req.query.leagueId, req.user.id, res);
  if (lid === false) return;
  sendFriendPredictions(req, res, lid, req.params.matchId).catch((err) => {
    console.error('friend-predictions:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Не удалось загрузить прогнозы друзей' });
  });
});

app.get('/api/leagues/:leagueId/matches/:matchId/predictions', authMiddleware, (req, res) => {
  sendFriendPredictions(req, res, req.params.leagueId, req.params.matchId).catch((err) => {
    console.error('friend-predictions:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Не удалось загрузить прогнозы друзей' });
  });
});

app.get('/api/matches/:matchId/players', authMiddleware, async (req, res) => {
  if (!isSquadEnabled()) {
    return res.status(503).json({
      error:
        'Список игроков недоступен. Запустите npm run export:squads или добавьте BZZOIRO_API_TOKEN в .env.',
    });
  }

  const matchId = Number(req.params.matchId);
  const match = q('SELECT home_team, away_team FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });

  try {
    const result = await getMatchSquads(match.home_team, match.away_team);
    res.json(result);
  } catch (e) {
    res.status(e.warnings?.length ? 502 : 404).json({
      error: e.message,
      warnings: e.warnings || [],
    });
  }
});

app.get('/api/squads', authMiddleware, (req, res) => {
  if (!isSquadEnabled()) {
    return res.status(503).json({
      error:
        'Список игроков недоступен. Запустите npm run export:squads или добавьте BZZOIRO_API_TOKEN в .env.',
    });
  }

  const bulk = getLocalSquadsBulk();
  if (!bulk?.teams || !Object.keys(bulk.teams).length) {
    return res.status(404).json({ error: 'Локальный squads.json пуст или отсутствует' });
  }

  res.json(bulk);
});

app.get('/api/teams/:teamName/players', authMiddleware, async (req, res) => {
  if (!isSquadEnabled()) {
    return res.status(503).json({
      error:
        'Список игроков недоступен. Запустите npm run export:squads или добавьте BZZOIRO_API_TOKEN в .env.',
    });
  }

  const teamName = decodeURIComponent(req.params.teamName || '').trim();
  if (!teamName) {
    return res.status(400).json({ error: 'Укажите команду' });
  }

  try {
    const result = await getTeamSquad(teamName);
    if (!result?.players?.length) {
      return res.status(404).json({
        error: `Состав для «${teamName}» не найден`,
      });
    }
    res.json({ team: teamName, players: result.players, source: result.source });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/matchdays', authMiddleware, (req, res) => {
  const leagueId = requireLeagueIdQuery(req.query.leagueId, req.user.id, res);
  if (leagueId === false) return;
  const days = q(
    `SELECT DISTINCT COALESCE(matchday, substr(kickoff, 1, 10)) AS day
     FROM matches ORDER BY day`
  ).all();

  const countForDay = q(
    `SELECT COUNT(*) AS c FROM matches
     WHERE COALESCE(matchday, substr(kickoff, 1, 10)) = ?`
  );
  const predictedForDay = leagueId
    ? q(
        `SELECT COUNT(*) AS c FROM predictions p
         JOIN matches m ON m.id = p.match_id
         WHERE p.league_id = ? AND p.user_id = ?
           AND COALESCE(m.matchday, substr(m.kickoff, 1, 10)) = ?`
      )
    : null;

  const matchdays = days.map((d, i) => {
    const count = countForDay.get(d.day).c;
    let predicted = 0;
    if (req.user?.id && predictedForDay && leagueId) {
      predicted = predictedForDay.get(leagueId, req.user.id, d.day).c;
    }
    return {
      day: d.day,
      md: i + 1,
      label: `MD${i + 1}`,
      count,
      predicted,
    };
  });

  res.json({ matchdays });
});

app.put('/api/matches/:id/result', authMiddleware, (req, res) => {
  const matchId = Number(req.params.id);
  const { leagueId, homeScore, awayScore, firstScorerTeam, firstScorerPlayer, finalHomeScore, finalAwayScore } =
    req.body;
  const lid = Number(leagueId);
  if (!lid || !requireActiveLeagueMember(lid, req.user.id, res)) return;

  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });

  if ((homeScore != null && homeScore < 0) || (awayScore != null && awayScore < 0)) {
    return res.status(400).json({ error: 'Некорректный счёт' });
  }

  let finalHome = match.final_home_score ?? null;
  let finalAway = match.final_away_score ?? null;
  if ('finalHomeScore' in req.body || 'finalAwayScore' in req.body) {
    finalHome =
      finalHomeScore === undefined || finalHomeScore === null || finalHomeScore === ''
        ? null
        : Number(finalHomeScore);
    finalAway =
      finalAwayScore === undefined || finalAwayScore === null || finalAwayScore === ''
        ? null
        : Number(finalAwayScore);
    if (
      (finalHome != null && (Number.isNaN(finalHome) || finalHome < 0)) ||
      (finalAway != null && (Number.isNaN(finalAway) || finalAway < 0))
    ) {
      return res.status(400).json({ error: 'Некорректный итоговый счёт' });
    }
    if ((finalHome == null) !== (finalAway == null)) {
      return res.status(400).json({ error: 'Укажите оба значения итогового счёта' });
    }
  }

  const finished = parseIsFinishedFlag(req.body);

  // Mark admin_cleared only when null scores are saved AFTER kickoff.
  // A null save before kickoff should not block the auto-init that fires at match start.
  const kickoffPassed = match.kickoff && new Date(match.kickoff) <= new Date();
  const adminCleared = kickoffPassed && homeScore == null && awayScore == null ? 1 : 0;

  // Auto-infer first scorer team from squad when player is set but team is not.
  let resolvedFirstScorerTeam = firstScorerTeam || null;
  if (!resolvedFirstScorerTeam && firstScorerPlayer && firstScorerPlayer !== 'none') {
    resolvedFirstScorerTeam = findPlayerSide(firstScorerPlayer, match.home_team, match.away_team);
  }

  const scorerMeta = inferFirstScorerMeta({
    ...match,
    first_scorer_team: resolvedFirstScorerTeam,
    first_scorer_player: firstScorerPlayer || null,
  });

  q(
    `UPDATE matches SET home_score = ?, away_score = ?,
     first_scorer_team = ?, first_scorer_player = ?,
     first_scorer_player_team = ?, first_scorer_is_own_goal = ?,
     final_home_score = ?, final_away_score = ?,
     is_finished = ?, admin_cleared = ? WHERE id = ?`
  ).run(
    homeScore,
    awayScore,
    resolvedFirstScorerTeam,
    firstScorerPlayer || null,
    scorerMeta.first_scorer_player_team,
    firstScorerPlayer && firstScorerPlayer !== 'none' ? scorerMeta.first_scorer_is_own_goal : null,
    finalHome,
    finalAway,
    finished,
    adminCleared,
    matchId
  );

  resolveAndApplyKnockoutTeams(db);
  const saved = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  res.json({
    match: {
      ...saved,
      is_finished: finished,
      isFinished: finished === 1,
      firstScorerIsOwnGoal: Number(saved.first_scorer_is_own_goal) === 1,
    },
  });
});

app.delete('/api/matches/:id/result', authMiddleware, (req, res) => {
  const matchId = Number(req.params.id);
  const lid = Number(req.query.leagueId);
  if (!lid || !requireActiveLeagueMember(lid, req.user.id, res)) return;

  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });

  q(
    `UPDATE matches SET home_score = NULL, away_score = NULL,
     first_scorer_team = NULL, first_scorer_player = NULL,
     first_scorer_player_team = NULL, first_scorer_is_own_goal = NULL,
     final_home_score = NULL, final_away_score = NULL,
     is_finished = 0, admin_cleared = 1 WHERE id = ?`
  ).run(matchId);

  resolveAndApplyKnockoutTeams(db);
  res.json({ ok: true });
});

app.post('/api/predictions', authMiddleware, (req, res) => {
  const {
    matchId,
    homeScore,
    awayScore,
    firstTeam,
    firstPlayer,
    booster,
    leagueId,
  } = req.body;
  const id = Number(matchId);
  const lid = Number(leagueId);
  if (!lid) return res.status(400).json({ error: 'Укажите лигу' });
  const match = q('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });
  if (!requireActiveLeagueMember(lid, req.user.id, res)) return;
  if (matchLockState(match).locked) {
    return res.status(400).json({ error: 'Прогнозы закрыты — матч уже начался' });
  }
  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: 'Укажите счёт' });
  }

  const day = matchdayKey(match);
  const existing = q(
    'SELECT booster FROM predictions WHERE league_id = ? AND user_id = ? AND match_id = ?'
  ).get(lid, req.user.id, id);
  const boosterSpecified = Object.prototype.hasOwnProperty.call(req.body, 'booster');
  const boosterVal = boosterSpecified ? (booster ? 1 : 0) : (existing?.booster ?? 0);

  if (boosterSpecified && boosterVal === 1) {
    if (isBoosterLockedForMatchday(lid, req.user.id, day)) {
      return res.status(400).json({
        error: 'Бустер закреплён — матч с бустером уже начался',
      });
    }
    clearBoostersForMatchday(lid, req.user.id, day);
  }

  try {
    q(
      `INSERT INTO predictions (league_id, user_id, match_id, home_pred, away_pred, first_team, first_player, booster, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(league_id, user_id, match_id) DO UPDATE SET
         home_pred = excluded.home_pred,
         away_pred = excluded.away_pred,
         first_team = excluded.first_team,
         first_player = excluded.first_player,
         booster = excluded.booster,
         updated_at = datetime('now')`
    ).run(
      lid,
      req.user.id,
      id,
      homeScore,
      awayScore,
      firstTeam || null,
      firstPlayer || null,
      boosterVal
    );
  } catch (err) {
    console.error('save prediction:', err);
    if (!predictionsSchemaOk()) {
      return res.status(503).json({
        error: 'База устарела — остановите сервер и снова запустите npm run dev',
      });
    }
    return res.status(500).json({ error: 'Не удалось сохранить прогноз' });
  }

  res.json({ ok: true });
});

app.post('/api/predictions/booster', authMiddleware, (req, res) => {
  const { leagueId, matchId, active } = req.body;
  const lid = Number(leagueId);
  const id = Number(matchId);
  if (!lid || !id) return res.status(400).json({ error: 'Укажите лигу и матч' });
  if (!requireActiveLeagueMember(lid, req.user.id, res)) return;

  const match = q('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });
  if (matchLockState(match).locked) {
    return res.status(400).json({ error: 'Прогнозы закрыты — матч уже начался' });
  }

  const pred = q(
    'SELECT home_pred, away_pred FROM predictions WHERE league_id = ? AND user_id = ? AND match_id = ?'
  ).get(lid, req.user.id, id);
  if (pred?.home_pred == null || pred?.away_pred == null) {
    return res.status(400).json({ error: 'Сначала сохраните прогноз на этот матч' });
  }

  const day = matchdayKey(match);
  const assign = active !== false && active !== 0 && active !== '0';

  if (isBoosterLockedForMatchday(lid, req.user.id, day)) {
    return res.status(400).json({
      error: 'Бустер закреплён — матч с бустером уже начался',
    });
  }

  clearBoostersForMatchday(lid, req.user.id, day);
  if (assign) {
    q('UPDATE predictions SET booster = 1 WHERE league_id = ? AND user_id = ? AND match_id = ?').run(
      lid,
      req.user.id,
      id
    );
  }

  res.json({ ok: true, boosterMatchId: assign ? id : null, matchday: day });
});

app.get('/api/scoring/example', (_req, res) => {
  const pred = {
    home_pred: 2,
    away_pred: 1,
    first_team: 'home',
    first_player: 'Lozano',
    booster: 1,
  };
  const actual = {
    home_score: 2,
    away_score: 1,
    first_scorer_team: 'home',
    first_scorer_player: 'Lozano',
    stage: 'group',
  };
  const breakdown = breakdownMatchPoints(pred, actual);
  res.json({
    description: 'Прогноз 2:1, факт 2:1, первая команда и игрок угаданы, бустер ×2 (группа)',
    prediction: { score: '2:1', firstTeam: 'home', firstPlayer: 'Lozano', booster: true },
    actual: { score: '2:1', firstScorerTeam: 'home', firstScorerPlayer: 'Lozano' },
    breakdown,
    lines: [
      { label: 'Исход (победа / ничья)', points: breakdown.outcome },
      { label: 'Голы хозяев', points: breakdown.homeGoals },
      { label: 'Голы гостей', points: breakdown.awayGoals },
      { label: 'Разница в счёте', points: breakdown.goalDifference },
      { label: 'Команда, открывшая счёт', points: breakdown.firstTeam },
      { label: 'Игрок, открывший счёт', points: breakdown.firstPlayer },
      { label: 'Подытог до бустера', points: breakdown.scoreSubtotal },
      { label: `Бустер ×${breakdown.boosterMultiplier}`, points: breakdown.afterBooster - breakdown.scoreSubtotal, note: `×${breakdown.boosterMultiplier}` },
      { label: 'Итого за матч', points: breakdown.total },
    ],
  });
});

app.get('/health', (_req, res) => {
  const info = dbStartupInfo();
  res.json({
    ok: true,
    db: {
      path: info.dbPath,
      persistent: info.persistent,
      userCount: info.userCount,
    },
  });
});

app.get('/api/results/sync-status', (_req, res) => {
  res.json(getSyncStatus(db));
});

app.post('/api/results/sync', authMiddleware, async (req, res) => {
  if (!resultsSyncEnabled()) {
    return res.status(503).json({
      error: 'Автосинхронизация выключена. Добавьте BZZOIRO_API_TOKEN в .env.',
    });
  }
  try {
    const result = await syncResultsFromApi(db);
    res.json(result);
  } catch (err) {
    console.error('Manual results sync:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tournament', (_req, res) => {
  const stats = q(
    `SELECT
       (SELECT COUNT(*) FROM matches) AS total_matches,
       (SELECT COUNT(*) FROM matches WHERE home_score IS NOT NULL) AS finished_matches,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM leagues) AS leagues`
  ).get();
  const matchdays = q(
    `SELECT DISTINCT COALESCE(matchday, substr(kickoff, 1, 10)) AS day
     FROM matches ORDER BY day`
  ).all();
  res.json({
    name: 'FIFA World Cup 2026',
    hosts: ['USA', 'Mexico', 'Canada'],
    groups: 'ABCDEFGHIJKL'.split(''),
    matchdays: matchdays.map((d) => d.day),
    ...stats,
  });
});

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Ошибка сервера' });
});

function initStartedMatchScores() {
  db.prepare(
    `UPDATE matches SET home_score = 0, away_score = 0, admin_cleared = 0
     WHERE home_score IS NULL AND away_score IS NULL
     AND is_finished = 0 AND kickoff <= ?`
  ).run(new Date().toISOString());
}

const server = app.listen(PORT, () => {
  if (!predictionsSchemaOk()) {
    console.error('FATAL: predictions table missing league_id — restart after db migration');
  }
  if (!finalScoreColumnsOk()) {
    console.error('FATAL: matches table missing final_home_score/final_away_score columns');
  }
  startResultsSyncScheduler(db);
  startLiveScoresScheduler(db);
  startFifaScoreSuggestionsScheduler();
  // Set 0:0 for any matches that started while the server was down.
  initStartedMatchScores();
  // Keep running every 60 s so newly started matches get 0:0 without waiting for an API call.
  setInterval(initStartedMatchScores, 60000);
  console.log(`WC 2026 Predictor API on http://localhost:${PORT}`);
  console.log('  Final score fields (admin):', finalScoreColumnsOk() ? 'ready' : 'MISSING');
  console.log('  GET /api/squads — all squads from server/data/squads.json');
  console.log('  GET /api/teams/:teamName/players — one team (JSON cache or Bzzoiro fallback)');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or run: lsof -ti :${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});
