# Deploy WC 2026 Predictor

## Option A — Render (recommended, free)

1. Push this folder to GitHub (see below) or use the repo: `SergeiTrush/wc2026-predictor`
2. Open [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**
3. Connect the GitHub repo → Render reads `render.yaml` and deploys
4. Or use the one-click button in `README.md` after the repo exists

Your app will be at `https://wc2026-predictor.onrender.com` (name may vary).

**Persistent data (Render):** `render.yaml` attaches a 1 GB disk at `/opt/render/project/src/data` (the app’s default `./data` folder). This requires the **Starter** plan (~$7/mo) — [free web services cannot use persistent disks](https://render.com/docs/free).

**Render checklist:**
1. **Disks** → mount path exactly: `/opt/render/project/src/data`
2. **Environment** → delete `DATA_DIR` if it is set to `/data` (wrong path)
3. Redeploy → logs must show `persistent disk: yes`
4. Open `https://your-app.onrender.com/health` → `"persistent": true`, `"userCount"` increases after registration
5. Register once after disk is configured; data survives later redeploys

If the disk is missing, the app **fails to start** on Render (instead of silently losing data).

**Render build failed (`client/package.json` not found)?** In the service **Settings → Build & Deploy**, set **Root Directory** to empty (repo root), not `client`. Build command: `npm install --include=dev && npm run build`. If Root Directory must stay `client`, the shim `client/package.json` delegates install/build to the parent folder.

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
