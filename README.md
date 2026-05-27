# World Cup 2026 Predictor

A small friends-league score prediction app for **FIFA World Cup 2026** (USA, Mexico, Canada). Works like popular Euro 2024 office pools: create a private league, share an invite code, predict match scores, and compete on the leaderboard.

## Features

- **Private leagues** with 6-character invite codes
- **All 72 group-stage matches** plus knockout rounds (R32 → Final)
- **Euro-style scoring**: 3 pts exact score, 1 pt correct result, **2× in knockouts**
- Predictions **lock at kickoff**
- League **host** can enter official results to update standings

## Deploy online (free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SergeiTrush/wc2026-predictor)

1. Click the button above (or see [DEPLOY.md](./DEPLOY.md))
2. Sign in to Render → connect GitHub → deploy
3. Share the URL with friends (e.g. `https://wc2026-predictor.onrender.com`)

## Requirements

- **Node.js 22+** (uses built-in `node:sqlite` — no native addons)

## Quick start

```bash
cd prediction-app
npm run install:all
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3001  

1. Sign up with a display name  
2. **Create league** → share the code with friends  
3. Friends **Join with code**  
4. Pick scores under **Predictions**  
5. Host enters results after matches → **Leaderboard** updates  

## Production

```bash
npm run install:all
npm run build
JWT_SECRET=your-secret-here NODE_ENV=production npm start
```

Serves the built React app from the API on port 3001.

## Data

Match fixtures are seeded from the official World Cup 2026 draw (group stage + knockout schedule). SQLite database is stored in `prediction-app/data/wc2026.db` (gitignored).

## Scoring rules

| Outcome | Group stage | Knockout |
|---------|-------------|----------|
| Exact score | 3 | 6 |
| Correct result (W/D/L) | 1 | 2 |
| Wrong | 0 | 0 |
