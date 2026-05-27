const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const path = require('path');

const db = require('./db');
const { prepare, transaction } = require('./sqlite-helpers');
const { seedDatabase } = require('./seed');
const { totalMatchPoints, matchdayFromKickoff } = require('./scoring');

const q = (query) => prepare(db, query);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'wc2026-dev-secret-change-in-production';
const inviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

if (process.env.NODE_ENV === 'production' && JWT_SECRET.includes('dev-secret')) {
  console.warn('WARNING: Set JWT_SECRET in production.');
}

const seedResult = seedDatabase(db);
if (seedResult.matchCount === 0) {
  console.warn('No matches in database — seed may have failed.');
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
  ).get(leagueId, userId);
}

function isLeagueOwner(leagueId, userId) {
  return q('SELECT 1 FROM leagues WHERE id = ? AND owner_id = ?').get(leagueId, userId);
}

function matchIsLocked(match) {
  if (match.home_score != null) return true;
  return new Date(match.kickoff) <= new Date();
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
    `SELECT * FROM predictions WHERE match_id = ? AND user_id IN (${placeholders})`
  ).all(matchId, ...ids);
}

function popularScores(leagueId, matchId) {
  const preds = leaguePredictionsForMatch(leagueId, matchId);
  const counts = {};
  for (const p of preds) {
    const key = `${p.home_pred}-${p.away_pred}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = preds.length || 1;
  return Object.entries(counts)
    .map(([score, count]) => ({
      score: score.replace('-', ':'),
      percent: Math.round((count / total) * 100),
      count,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);
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
    `SELECT l.id, l.name, l.code, l.owner_id,
            (SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) AS member_count,
            (l.owner_id = ?) AS is_owner
     FROM leagues l
     INNER JOIN league_members m ON m.league_id = l.id AND m.user_id = ?
     ORDER BY l.created_at DESC`
  ).all(req.user.id, req.user.id);
  res.json({ leagues });
});

app.get('/api/leagues/:id', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  const member = isLeagueMember(leagueId, req.user.id);
  if (!member) return res.status(403).json({ error: 'Not a member' });

  const league = q('SELECT id, name, code, owner_id FROM leagues WHERE id = ?').get(leagueId);
  const members = q(
    `SELECT u.id, u.name, lm.suspended, (l.owner_id = u.id) AS is_owner
     FROM users u
     INNER JOIN league_members lm ON lm.user_id = u.id
     INNER JOIN leagues l ON l.id = lm.league_id
     WHERE lm.league_id = ?
     ORDER BY u.name`
  ).all(leagueId);

  res.json({
    league: {
      ...league,
      is_owner: league.owner_id === req.user.id,
    },
    members: members.map((m) => ({
      ...m,
      is_you: m.id === req.user.id,
    })),
  });
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
  if (!isLeagueMember(league.id, req.user.id)) {
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
  const next = row.suspended ? 0 : 1;
  q('UPDATE league_members SET suspended = ? WHERE league_id = ? AND user_id = ?').run(
    next,
    leagueId,
    userId
  );
  res.json({ suspended: next === 1 });
});

app.get('/api/leagues/:id/leaderboard', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!isLeagueMember(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Not a member' });
  }

  const members = q(
    `SELECT u.id, u.name FROM users u
     INNER JOIN league_members lm ON lm.user_id = u.id
     WHERE lm.league_id = ? AND lm.suspended = 0
     ORDER BY u.name`
  ).all(leagueId);

  const finishedMatches = q(
    'SELECT * FROM matches WHERE home_score IS NOT NULL AND away_score IS NOT NULL'
  ).all();

  const getPred = q('SELECT * FROM predictions WHERE user_id = ? AND match_id = ?');

  const leaderboard = members.map((member) => {
    let total = 0;
    for (const match of finishedMatches) {
      const pred = getPred.get(member.id, match.id);
      if (!pred) continue;
      const leaguePreds = leaguePredictionsForMatch(leagueId, match.id);
      total += totalMatchPoints(pred, match, leaguePreds);
    }
    return { userId: member.id, name: member.name, points: total };
  });

  leaderboard.sort((a, b) => b.points - a.points);
  res.json({ leaderboard });
});

// ——— Matches ———
app.get('/api/matches', authMiddleware, (req, res) => {
  const { stage, group, matchday, leagueId } = req.query;
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
  } else if (!stage && !group) {
    query += ` AND kickoff >= datetime('now', '-1 day')`;
  }
  query += ' ORDER BY kickoff ASC';
  if (!matchday && !stage && !group) {
    query += ' LIMIT 48';
  }
  const matches = q(query).all(...params);

  const getPred = q('SELECT * FROM predictions WHERE user_id = ? AND match_id = ?');
  const lid = leagueId ? Number(leagueId) : null;

  const enriched = matches.map((m) => {
    const prediction = getPred.get(req.user.id, m.id) || null;
    let friendsPredicted = 0;
    let popular = [];
    if (lid && isLeagueMember(lid, req.user.id)) {
      const preds = leaguePredictionsForMatch(lid, m.id);
      friendsPredicted = preds.length;
      popular = popularScores(lid, m.id);
    }
    return {
      ...m,
      matchday: m.matchday || matchdayFromKickoff(m.kickoff),
      locked: matchIsLocked(m),
      prediction,
      friendsPredicted,
      popularPredictions: popular,
    };
  });

  res.json({ matches: enriched });
});

app.get('/api/matchdays', authMiddleware, (_req, res) => {
  const days = q(
    `SELECT DISTINCT COALESCE(matchday, substr(kickoff, 1, 10)) AS day
     FROM matches ORDER BY day`
  ).all();
  res.json({ matchdays: days.map((d) => d.day) });
});

app.put('/api/matches/:id/result', authMiddleware, (req, res) => {
  const matchId = Number(req.params.id);
  const { homeScore, awayScore, firstScorerTeam, firstScorerPlayer } = req.body;
  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const ownerOfAny = q('SELECT 1 FROM leagues WHERE owner_id = ? LIMIT 1').get(req.user.id);
  if (!ownerOfAny) return res.status(403).json({ error: 'Только владелец лиги' });

  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: 'Укажите счёт' });
  }

  q(
    `UPDATE matches SET home_score = ?, away_score = ?,
     first_scorer_team = ?, first_scorer_player = ? WHERE id = ?`
  ).run(homeScore, awayScore, firstScorerTeam || null, firstScorerPlayer || null, matchId);

  res.json({ match: q('SELECT * FROM matches WHERE id = ?').get(matchId) });
});

app.post('/api/predictions', authMiddleware, (req, res) => {
  const {
    matchId,
    homeScore,
    awayScore,
    firstTeam,
    firstPlayer,
    booster,
  } = req.body;
  const id = Number(matchId);
  const match = q('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Матч не найден' });
  if (matchIsLocked(match)) {
    return res.status(400).json({ error: 'Прогнозы закрыты' });
  }
  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: 'Укажите счёт' });
  }

  const day = match.matchday || matchdayFromKickoff(match.kickoff);

  if (booster) {
    const others = q(
      `SELECT p.match_id FROM predictions p
       INNER JOIN matches m ON m.id = p.match_id
       WHERE p.user_id = ? AND p.booster = 1
         AND COALESCE(m.matchday, substr(m.kickoff, 1, 10)) = ? AND p.match_id != ?`
    ).all(req.user.id, day, id);
    for (const row of others) {
      q('UPDATE predictions SET booster = 0 WHERE user_id = ? AND match_id = ?').run(
        req.user.id,
        row.match_id
      );
    }
  }

  q(
    `INSERT INTO predictions (user_id, match_id, home_pred, away_pred, first_team, first_player, booster, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       home_pred = excluded.home_pred,
       away_pred = excluded.away_pred,
       first_team = excluded.first_team,
       first_player = excluded.first_player,
       booster = excluded.booster,
       updated_at = datetime('now')`
  ).run(
    req.user.id,
    id,
    homeScore,
    awayScore,
    firstTeam || null,
    firstPlayer || null,
    booster ? 1 : 0
  );

  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/tournament', (_req, res) => {
  const stats = q(
    `SELECT
       (SELECT COUNT(*) FROM matches) AS total_matches,
       (SELECT COUNT(*) FROM matches WHERE home_score IS NOT NULL) AS finished_matches,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM leagues) AS leagues`
  ).get();
  res.json({
    name: 'FIFA World Cup 2026',
    hosts: ['USA', 'Mexico', 'Canada'],
    groups: 'ABCDEFGHIJKL'.split(''),
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

app.listen(PORT, () => {
  console.log(`WC 2026 Predictor API on http://localhost:${PORT}`);
});
