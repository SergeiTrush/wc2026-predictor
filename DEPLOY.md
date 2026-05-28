# Deploy WC 2026 Predictor

## Option A — Render (recommended, free)

1. Push this folder to GitHub (see below) or use the repo: `SergeiTrush/wc2026-predictor`
2. Open [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
3. Connect the GitHub repo → Render reads `render.yaml` and deploys
4. Or use the one-click button in `README.md` after the repo exists

Your app will be at `https://wc2026-predictor.onrender.com` (name may vary).

**Note (free tier):** Data is stored in SQLite on the server disk. It resets if the service sleeps or redeploys. Fine for friends testing; upgrade Render or add a volume for persistence.

---

## Option B — Docker (Fly.io, Railway, any VPS)

```bash
docker build -t wc2026-predictor .
docker run -p 3001:3001 -e JWT_SECRET=your-long-secret -v wc2026-data:/data -e DATA_DIR=/data wc2026-predictor
```

Open http://localhost:3001

---

## Option C — Push to GitHub (first time)

From this directory:

```bash
git init
git add .
git commit -m "WC 2026 predictor"
gh repo create wc2026-predictor --public --source=. --remote=origin --push
```

Then deploy via Render (Option A).

---

## Environment variables

| Variable     | Required | Description                          |
|-------------|----------|--------------------------------------|
| `JWT_SECRET`| Production | Random string for auth tokens      |
| `PORT`      | Auto     | Set by host (Render, Fly, etc.)      |
| `DATA_DIR`  | Optional | SQLite folder (use `/data` + volume) |
| `NODE_ENV`  | `production` | Serves built React app           |
