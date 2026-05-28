# World Cup 2026 Match Predictor

Private league app in the style of the [Euro 2024 Match Predictor](https://www.youtube.com/watch?v=pXh2ki_iZu8) (FPL Kevlo), with the full **FIFA World Cup 2026** schedule (48 teams, 104 matches).

## How it works

1. Create or join a league with an invite code.
2. Open **Матчи** — pick a matchday (MD1, MD2, …).
3. For each match enter:
   - **Exact score**
   - **First team to score** / **first goalscorer**
   - **One booster per matchday** (2× group/R16, up to 5× in the final)
4. Compete on the **Таблица** leaderboard.

## Scoring (Euro-style)

| Rule | Points |
|------|--------|
| Correct outcome | 3 |
| Home / away goals | 2 + 2 |
| Goal difference | 3 |
| First team to score | 2 |
| First player to score | 8 |
| Underdog bonus (&lt;10% in league) | 5 |
| Booster | ×2–×5 by stage |

## Quick start

```bash
cd prediction-app
npm run install:all
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:3001  

## Deploy

**Recommended (card issues / always on):** [VPS + Docker](DEPLOY-VPS.md) — persistent DB, no cold start.

**Stay on Render free:** [Render + Supabase](DEPLOY-EASY.md) — $0, short cold start OK.

Also: [Render paid](DEPLOY-RENDER-PAID.md) · [Oracle free VM](DEPLOY-ORACLE.md) · [Fly.io](DEPLOY.md).

Requires **Node.js 22+**.

## Automatic results (API-Football)

1. Register at [api-football.com](https://www.api-football.com/) (free tier: 100 requests/day).
2. Copy `.env.example` to `.env` and set `API_FOOTBALL_KEY`.
3. Restart the server — it syncs every 15 minutes and on demand from **Таблица → Обновить результаты**.

| Variable | Default | Description |
|----------|---------|-------------|
| `API_FOOTBALL_KEY` | — | Required for auto sync |
| `API_FOOTBALL_LEAGUE_ID` | `1` | World Cup on api-sports |
| `API_FOOTBALL_SEASON` | `2026` | Season year |
| `RESULTS_SYNC_INTERVAL_MS` | `900000` | Auto sync interval |

Scores update the `matches` table; the leaderboard recalculates using `shared/scoring.js`.

## Data

Groups A–L and knockout bracket follow the [FIFA World Cup 2026](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026) draw (USA, Mexico, Canada).
