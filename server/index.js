const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const path = require('path');

const db = require('./db');
const { prepare, transaction } = require('./sqlite-helpers');
const { seedDatabase } = require('./seed');
const { matchPoints } = require('./scoring');

const q = (query) => prepare(db, query);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'wc2026-dev-secret-change-in-production';

if (process.env.NODE_ENV === 'production' && JWT_SECRET.includes('dev-secret')) {
  console.warn('WARNING: Set JWT_SECRET in production (e.g. Render env vars).');
}
const inviteCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

seedDatabase(db);

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
  return q('SELECT 1 FROM league_members WHERE league_id = ? AND user_id = ?').get(leagueId, userId);
}

function matchIsLocked(match) {
  if (match.home_score != null) return true;
  return new Date(match.kickoff) <= new Date();
}

app.post('/api/auth/register', (req, res) => {
  const { name, password } = req.body;
  if (!name?.trim() || !password || password.length < 4) {
    return res.status(400).json({ error: 'Name and password (min 4 chars) required' });
  }
  const trimmed = name.trim();
  const existing = q('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(trimmed);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
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
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = q('SELECT id, name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

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

app.post('/api/leagues', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'League name required' });
  }
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
  const league = q('SELECT id, name, code, owner_id FROM leagues WHERE id = ?').get(leagueId);
  res.status(201).json({ league });
});

app.post('/api/leagues/join', authMiddleware, (req, res) => {
  const code = req.body.code?.trim().toUpperCase();
  const league = q('SELECT * FROM leagues WHERE code = ?').get(code);
  if (!league) return res.status(404).json({ error: 'League not found' });
  if (!isLeagueMember(league.id, req.user.id)) {
    q('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)').run(league.id, req.user.id);
  }
  res.json({ league: { id: league.id, name: league.name, code: league.code } });
});

app.get('/api/leagues/:id/leaderboard', authMiddleware, (req, res) => {
  const leagueId = Number(req.params.id);
  if (!isLeagueMember(leagueId, req.user.id)) {
    return res.status(403).json({ error: 'Not a league member' });
  }

  const members = q(
    `SELECT u.id, u.name FROM users u
     INNER JOIN league_members lm ON lm.user_id = u.id
     WHERE lm.league_id = ?
     ORDER BY u.name`
  ).all(leagueId);

  const finishedMatches = q(
    'SELECT * FROM matches WHERE home_score IS NOT NULL AND away_score IS NOT NULL'
  ).all();

  const getPred = q(
    'SELECT home_pred, away_pred FROM predictions WHERE user_id = ? AND match_id = ?'
  );

  const leaderboard = members.map((member) => {
    let total = 0;
    let exactScores = 0;
    let correctResults = 0;

    for (const match of finishedMatches) {
      const pred = getPred.get(member.id, match.id);
      if (!pred) continue;
      total += matchPoints(
        pred.home_pred,
        pred.away_pred,
        match.home_score,
        match.away_score,
        match.stage
      );
      if (pred.home_pred === match.home_score && pred.away_pred === match.away_score) {
        exactScores += 1;
      }
      if (
        Math.sign(pred.home_pred - pred.away_pred) ===
        Math.sign(match.home_score - match.away_score)
      ) {
        correctResults += 1;
      }
    }

    return {
      userId: member.id,
      name: member.name,
      points: total,
      exactScores,
      correctResults,
      predictionsMade: q('SELECT COUNT(*) AS n FROM predictions WHERE user_id = ?').get(member.id)
        .n,
    };
  });

  leaderboard.sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);
  res.json({ leaderboard });
});

app.get('/api/matches', authMiddleware, (req, res) => {
  const { stage, group } = req.query;
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
  query += ' ORDER BY kickoff ASC';
  const matches = q(query).all(...params);

  const getPred = q(
    'SELECT home_pred, away_pred, updated_at FROM predictions WHERE user_id = ? AND match_id = ?'
  );

  const enriched = matches.map((m) => ({
    ...m,
    locked: matchIsLocked(m),
    prediction: getPred.get(req.user.id, m.id) || null,
  }));

  res.json({ matches: enriched });
});

app.put('/api/matches/:id/result', authMiddleware, (req, res) => {
  const matchId = Number(req.params.id);
  const { homeScore, awayScore } = req.body;
  const match = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const ownerOfAny = q('SELECT 1 FROM leagues WHERE owner_id = ? LIMIT 1').get(req.user.id);
  if (!ownerOfAny) {
    return res.status(403).json({ error: 'Only league owners can enter results' });
  }

  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: 'Valid scores required' });
  }

  q('UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?').run(
    homeScore,
    awayScore,
    matchId
  );
  const updated = q('SELECT * FROM matches WHERE id = ?').get(matchId);
  res.json({ match: updated });
});

app.post('/api/predictions', authMiddleware, (req, res) => {
  const { matchId, homeScore, awayScore } = req.body;
  const id = Number(matchId);
  const match = q('SELECT * FROM matches WHERE id = ?').get(id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (matchIsLocked(match)) {
    return res.status(400).json({ error: 'Predictions closed for this match' });
  }
  if (homeScore == null || awayScore == null || homeScore < 0 || awayScore < 0) {
    return res.status(400).json({ error: 'Valid scores required' });
  }

  q(
    `INSERT INTO predictions (user_id, match_id, home_pred, away_pred, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       home_pred = excluded.home_pred,
       away_pred = excluded.away_pred,
       updated_at = datetime('now')`
  ).run(req.user.id, id, homeScore, awayScore);

  res.json({ prediction: { matchId: id, homeScore, awayScore } });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

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
    scoring: {
      exactScore: 3,
      correctResult: 1,
      knockoutMultiplier: 2,
    },
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
