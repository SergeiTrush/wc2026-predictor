# World Cup 2026 Predictor

Friends league app combining:

1. **[FIFA Bracket Challenge](https://play.fifa.com/bracket-predictor/en/brackets)** — 12 groups, 8 best third places, full knockout tree to champion (48-team format).
2. **[Euro Match Predictor](https://www.youtube.com/watch?v=pXh2ki_iZu8)** style — per-match scorelines, first scorer, one booster per matchday.

## Features

- Private leagues with invite codes
- **Брекет** — group standings (1st–4th), pick 8 advancing 3rd-place teams, winners through R32 → Final
- **Прогнозы** — match-by-match scores with popular picks from your league
- Leaderboard and league settings

## Quick start

```bash
cd prediction-app
npm run install:all
npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:3001  

## Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SergeiTrush/wc2026-predictor)

Requires **Node.js 22+**.

## Data source

Groups and knockout paths follow the [FIFA World Cup 2026](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/knockout-stage-match-schedule-bracket) draw and schedule (USA, Mexico, Canada).
