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
const { prepare, transaction } = require('./sqlite-helpers');
const { seedDatabase } = require('./seed');
const {
  totalMatchPoints,
  matchdayFromKickoff,
  breakdownMatchPoints,
  formatPointsBreakdown,
} = require('../shared/scoring');
const {
  syncResultsFromApi,
  getSyncStatus,
  startResultsSyncScheduler,
  isEnabled: resultsSyncEnabled,
} = require('./sync-results');
const { isEnabled: apiFootballEnabled, getTeamSquad } = require('./api-football');
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

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'wc2026-dev-secret-change-in-production';
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

function requireLeagueIdQuery(rawLeagueId, userId, res) {
  if (rawLeagueId == null || rawLeagueId === '') return null;
  const lid = Number(rawLeagueId);
  if (!Number.isFinite(lid) || lid <= 0) {
    res.status(400).json({ error: 'Некорректная лига' });
    return false;
  }
  return requireActiveLeagueMember(lid, userId, res) ? lid : false;
}

function isLeagueOwner(leagueId, userId) {
  return q('SELECT 1 FROM leagues WHERE id = ? AND owner_id = ?').get(
    Number(leagueId),
    Number(userId)
  );
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

function matchHasResult(match) {
  return match.home_score != null && match.away_score != null;
}

/** Matches UI: `.live-score-bar` (result) or `.live-score-pending` (kickoff passed, no result yet). */
function isMatchLiveScoreBarVisible(match) {
  const hasResult = matchHasResult(match);
  return hasResult || matchLockState(match).locked;
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

function friendPredictionsForMatch(leagueId, matchId, userId, match) {
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

  const hasResult = matchHasResult(match);
  const allPreds = hasResult ? leaguePredictionsForMatch(leagueId, matchId) : [];

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
    if (hasResult) {
      const raw = breakdownMatchPoints(pred, match, allPreds);
      points = raw.total;
      pointsDetail = formatPointsBreakdown(raw);
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
  res.json({ leagues });
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
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;
  if (!isLeagueOwner(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Только владелец лиги' });
  }
  const payload = leagueDetailPayload(leagueId, req.user.id);
  if (!payload) return res.status(404).json({ error: 'Лига не найдена' });
  res.json(payload);
});

app.patch('/api/leagues/:id', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!isLeagueOwner(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Только владелец лиги' });
  }
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  q('UPDATE leagues SET name = ? WHERE id = ?').run(name.trim(), leagueId);
  res.json({ league: q('SELECT id, name, code, owner_id FROM leagues WHERE id = ?').get(leagueId) });
});

app.delete('/api/leagues/:id', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!isLeagueOwner(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Только владелец лиги' });
  }
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
  if (!isLeagueOwner(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Только владелец лиги' });
  }
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

app.get('/api/leagues/:id/leaderboard', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;
  const selectedMatchday = req.query.matchday ? String(req.query.matchday) : null;

  const members = q(
    `SELECT u.id, u.name, (l.owner_id = u.id) AS is_owner
     FROM users u
     INNER JOIN league_members lm ON lm.user_id = u.id
     INNER JOIN leagues l ON l.id = lm.league_id
     WHERE lm.league_id = ? AND lm.suspended = 0
     ORDER BY u.name`
  ).all(leagueId);

  const finishedMatches = selectedMatchday
    ? q(
        `SELECT * FROM matches
         WHERE home_score IS NOT NULL AND away_score IS NOT NULL
           AND COALESCE(matchday, substr(kickoff, 1, 10)) = ?`
      ).all(selectedMatchday)
    : q('SELECT * FROM matches WHERE home_score IS NOT NULL AND away_score IS NOT NULL').all();

  const getPred = q(
    'SELECT * FROM predictions WHERE league_id = ? AND user_id = ? AND match_id = ?'
  );

  const leaderboard = members.map((member) => {
    let total = 0;
    let scoredMatches = 0;
    for (const match of finishedMatches) {
      const pred = getPred.get(leagueId, member.id, match.id);
      if (!pred) continue;
      const leaguePreds = leaguePredictionsForMatch(leagueId, match.id);
      total += totalMatchPoints(pred, match, leaguePreds);
      scoredMatches += 1;
    }
    const brRow = q('SELECT picks FROM bracket_picks WHERE league_id = ? AND user_id = ?').get(
      leagueId,
      member.id
    );
    let bracketComplete = 0;
    if (brRow?.picks) {
      try {
        const p = JSON.parse(brRow.picks);
        if (p.champion && Object.keys(p.winners || {}).length >= 31) bracketComplete = 1;
      } catch {
        /* ignore */
      }
    }
    return {
      userId: member.id,
      name: member.name,
      isOwner: !!member.is_owner,
      points: total,
      matchPoints: total,
      scoredMatches,
      totalMatches: finishedMatches.length,
      bracketComplete,
    };
  });

  leaderboard.sort((a, b) => b.points - a.points);
  res.json({ leaderboard });
});

app.get('/api/leagues/:id/users/:userId/matchday-points', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  const userId = Number(req.params.userId);
  if (!requireActiveLeagueMember(leagueId, req.user.id, res)) return;

  const targetMember = q(
    'SELECT 1 AS ok FROM league_members WHERE league_id = ? AND user_id = ? AND suspended = 0'
  ).get(leagueId, userId);
  if (!targetMember) {
    return res.status(404).json({ error: 'Участник не найден в этой лиге' });
  }

  const days = q(
    `SELECT DISTINCT COALESCE(matchday, substr(kickoff, 1, 10)) AS day
     FROM matches
     ORDER BY day`
  ).all();

  const finishedByDay = q(
    `SELECT *
     FROM matches
     WHERE home_score IS NOT NULL AND away_score IS NOT NULL
       AND COALESCE(matchday, substr(kickoff, 1, 10)) = ?`
  );

  const getPred = q(
    'SELECT * FROM predictions WHERE league_id = ? AND user_id = ? AND match_id = ?'
  );

  const pointsByDay = {};
  for (const row of days) {
    const day = row.day;
    const finishedMatches = finishedByDay.all(day);
    let points = 0;
    let scoredMatches = 0;

    for (const match of finishedMatches) {
      const pred = getPred.get(leagueId, userId, match.id);
      if (!pred) continue;
      const leaguePreds = leaguePredictionsForMatch(leagueId, match.id);
      points += totalMatchPoints(pred, match, leaguePreds);
      scoredMatches += 1;
    }

    pointsByDay[day] = {
      points,
      scoredMatches,
      totalMatches: finishedMatches.length,
    };
  }

  res.json({ userId, pointsByDay });
});

// ——— Matches ———
app.get('/api/matches', authMiddleware, (req, res) => {
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
  const matches = q(query).all(...params);

  const getPred = q(
    'SELECT * FROM predictions WHERE league_id = ? AND user_id = ? AND match_id = ?'
  );
  const lid = requireLeagueIdQuery(leagueId, req.user.id, res);
  if (lid === false) return;

  const enriched = matches.map((m) => {
    const prediction =
      lid && isActiveLeagueMember(lid, req.user.id)
        ? getPred.get(lid, req.user.id, m.id) || null
        : null;
    let friendsPredicted = 0;
    let pointsDetail = null;
    const hasResult = m.home_score != null && m.away_score != null;
    if (lid && isActiveLeagueMember(lid, req.user.id)) {
      const leaguePreds = leaguePredictionsForMatch(lid, m.id);
      friendsPredicted = leaguePreds.filter(
        (p) => Number(p.user_id) !== Number(req.user.id)
      ).length;
      if (prediction && hasResult) {
        const raw = breakdownMatchPoints(prediction, m, leaguePreds);
        pointsDetail = formatPointsBreakdown(raw);
      }
    }
    const { locked, lockReason } = matchLockState(m);
    const friendPredictions =
      lid && isActiveLeagueMember(lid, req.user.id)
        ? friendPredictionsForMatch(lid, m.id, req.user.id, m)
        : null;
    return {
      ...m,
      matchday: m.matchday || matchdayFromKickoff(m.kickoff),
      locked,
      lockReason,
      prediction,
      friendsPredicted,
      friendPredictions,
      hasResult,
      pointsDetail,
    };
  });

  res.json({ matches: enriched });
});

function sendFriendPredictions(req, res, leagueId, matchId) {
  const lid = Number(leagueId);
  const mid = Number(matchId);
  if (!requireActiveLeagueMember(lid, req.user.id, res)) return;

  const match = q('SELECT * FROM matches WHERE id = ?').get(mid);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });

  if (!isMatchLiveScoreBarVisible(match)) {
    return res.status(403).json({
      error: 'Прогнозы друзей доступны после начала матча',
    });
  }

  const predictions = friendPredictionsForMatch(lid, mid, req.user.id, match);
  res.json({
    predictions,
    match: { id: match.id, home_team: match.home_team, away_team: match.away_team },
  });
}

app.get('/api/matches/:matchId/friend-predictions', authMiddleware, (req, res) => {
  const lid = requireLeagueIdQuery(req.query.leagueId, req.user.id, res);
  if (lid === false) return;
  sendFriendPredictions(req, res, lid, req.params.matchId);
});

app.get('/api/leagues/:leagueId/matches/:matchId/predictions', authMiddleware, (req, res) => {
  sendFriendPredictions(req, res, req.params.leagueId, req.params.matchId);
});

app.get('/api/teams/:teamName/players', authMiddleware, async (req, res) => {
  if (!apiFootballEnabled()) {
    return res.status(503).json({
      error: 'Список игроков недоступен. Добавьте API_FOOTBALL_KEY в .env на сервере.',
    });
  }

  const teamName = decodeURIComponent(req.params.teamName || '').trim();
  if (!teamName) {
    return res.status(400).json({ error: 'Укажите команду' });
  }

  try {
    const players = await getTeamSquad(teamName);
    if (!players) {
      return res.status(404).json({
        error: `Состав для «${teamName}» не найден в API-Football`,
      });
    }
    res.json({ team: teamName, players });
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

function assertLeagueOwner(leagueId, userId, res) {
  if (!leagueId || !isLeagueOwner(leagueId, userId)) {
    res.status(403).json({ error: 'Только владелец этой лиги' });
    return false;
  }
  return true;
}

app.put('/api/matches/:id/result', authMiddleware, (req, res) => {
  const matchId = Number(req.params.id);
  const { leagueId, homeScore, awayScore, firstScorerTeam, firstScorerPlayer } = req.body;
  const lid = Number(leagueId);
  if (!assertLeagueOwner(lid, req.user.id, res)) return;

  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });

  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: 'Укажите счёт' });
  }

  q(
    `UPDATE matches SET home_score = ?, away_score = ?,
     first_scorer_team = ?, first_scorer_player = ? WHERE id = ?`
  ).run(homeScore, awayScore, firstScorerTeam || null, firstScorerPlayer || null, matchId);

  res.json({ match: q('SELECT * FROM matches WHERE id = ?').get(matchId) });
});

app.delete('/api/matches/:id/result', authMiddleware, (req, res) => {
  const matchId = Number(req.params.id);
  const lid = Number(req.query.leagueId);
  if (!assertLeagueOwner(lid, req.user.id, res)) return;

  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });

  q(
    `UPDATE matches SET home_score = NULL, away_score = NULL,
     first_scorer_team = NULL, first_scorer_player = NULL WHERE id = ?`
  ).run(matchId);

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

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/results/sync-status', (_req, res) => {
  res.json(getSyncStatus(db));
});

app.post('/api/results/sync', authMiddleware, async (req, res) => {
  const isOwner = q('SELECT 1 FROM leagues WHERE owner_id = ? LIMIT 1').get(req.user.id);
  const adminSecret = process.env.ADMIN_SYNC_SECRET;
  const headerSecret = req.headers['x-sync-secret'];
  if (!isOwner && (!adminSecret || headerSecret !== adminSecret)) {
    return res.status(403).json({ error: 'Только владелец лиги или администратор' });
  }
  if (!resultsSyncEnabled()) {
    return res.status(503).json({
      error:
        'Автосинхронизация выключена. Добавьте API_FOOTBALL_KEY на сервере (api-football.com).',
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

app.listen(PORT, () => {
  if (!predictionsSchemaOk()) {
    console.error('FATAL: predictions table missing league_id — restart after db migration');
  }
  startResultsSyncScheduler(db);
  console.log(`WC 2026 Predictor API on http://localhost:${PORT}`);
  console.log('  GET /api/teams/:teamName/players — squad list (requires API_FOOTBALL_KEY)');
});
