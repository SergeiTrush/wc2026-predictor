# World Cup 2026 Match Predictor

Private league app for the **FIFA World Cup 2026** — full schedule (48 teams, 104 matches).

## How it works

1. Create or join a league with an invite code.
2. Open **Матчи** — pick a matchday (MD1, MD2, …).
3. For each match enter:
   - **Exact score**
   - **First team to score** / **first goalscorer**
   - **One booster per matchday** (×2 through quarter-finals, ×3 for 3rd-place, semi-final and final)
4. Compete on the **Таблица** leaderboard.

## Scoring

| Rule | Points |
|------|--------|
| Correct outcome | 3 |
| Home / away goals | 2 + 2 |
| Goal difference | 3 |
| First team to score | 2 |
| First player to score | 8 |
| Booster | ×2 (group–QF), ×3 (3rd-place, SF, final) |

## Quick start

```bash
npm install          # single install at project root
npm run dev          # API + Vite client
```

Use **Node.js 22+** (see `.node-version`). Frontend lives in `client/`; dependencies are managed from the root `package.json` only. If the API fails with `better-sqlite3` errors, run `npm rebuild better-sqlite3` with that Node version.

SQLite data is stored in `./data/wc2026.db`. If you see `attempt to write a readonly database`, stop any old API process on port 3001 and run `npm run dev` again from this project folder.

- App: http://localhost:5173  
- API: http://localhost:3001  

## Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SergeiTrush/wc2026-predictor)

Requires **Node.js 22+**.

## Bzzoiro BSD (data provider)

All live data comes from [Bzzoiro BSD](https://sports.bzzoiro.com/) — free football REST API.

1. Register at [sports.bzzoiro.com/register](https://sports.bzzoiro.com/register)
2. Copy `.env.example` to `.env` and set `BZZOIRO_API_TOKEN`
3. Restart the server — results sync every 15 minutes and on demand from **Таблица → Обновить результаты**

| Variable | Default | Description |
|----------|---------|-------------|
| `BZZOIRO_API_TOKEN` | — | Required for squads + results sync |
| `BZZOIRO_LEAGUE_ID` | auto | World Cup league id (optional) |
| `RESULTS_SYNC_INTERVAL_MS` | `900000` | Auto sync interval |
| `RESULTS_SYNC_MAX_EVENTS` | `15` | Max incident fetches per sync (first scorer) |
| `SQUAD_PROVIDER_ORDER` | `local,bzzoiro` | Squad lookup order |
| `EXPORT_SQUAD_DELAY_MS` | `400` | Delay between API calls during export |

Scores update the `matches` table; the leaderboard recalculates using `shared/scoring.js`.

## Player squads (Фамилия dropdown)

Squads load from:

1. **`server/data/squads.json`** — local cache (recommended for production)
2. **Bzzoiro BSD** — `BZZOIRO_API_TOKEN`

Export all squads once:

```bash
npm run export:squads
```

This writes `server/data/squads.json` with `{ surname, name, number, position }` per player.

## Data

Groups A–L and knockout bracket follow the [FIFA World Cup 2026](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026) draw (USA, Mexico, Canada).
