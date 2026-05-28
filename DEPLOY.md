# Deploy WC 2026 Predictor

## Production — Render Starter + disk (~$7–8/mo)

Always on, no cold start, SQLite on `/var/data` (persistent disk).

→ **[DEPLOY-RENDER-PAID.md](DEPLOY-RENDER-PAID.md)**

---

## Free — Render + Supabase backup

Keep Render free; add 3 env vars so SQLite is backed up to Supabase (cold start remains).

→ **[DEPLOY-EASY.md](DEPLOY-EASY.md)**

---

## VPS + Docker (recommended)

Any Linux VPS (Timeweb, Hetzner, Oracle, …) — persistent SQLite, always on, local payment OK.

→ **[DEPLOY-VPS.md](DEPLOY-VPS.md)**

```bash
bash scripts/vps-bootstrap.sh   # once on server
bash scripts/vps-deploy.sh      # build & start
```

Oracle-specific notes: **[DEPLOY-ORACLE.md](DEPLOY-ORACLE.md)**

---

## Fly.io (persistent data, scale to zero)

Use this instead of Render free tier: SQLite lives on a **volume** (`DATA_DIR=/data`). Users and leagues survive sleep/restart; first visit after idle may take a few seconds to wake.

**Billing:** Fly requires a **credit card on file** for new accounts ([billing dashboard](https://fly.io/dashboard/personal/billing)), even for scale-to-zero. With `min_machines_running = 0` you only pay when the machine runs (often **$0** or a few cents/month for a small friends app).

**Always-on (optional):** set `min_machines_running = 1` in `fly.toml` (~$5–7/month).

### One-time setup

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and log in:

   ```bash
   fly auth login
   ```

2. From this directory, create the app (skip if it already exists):

   ```bash
   fly apps create wc2026-predictor
   ```

3. Create a persistent volume (only once per region):

   ```bash
   fly volumes create wc2026_data --region ams --size 1
   ```

4. Set secrets (copy values from your local `.env` or Render dashboard):

   ```bash
   fly secrets set JWT_SECRET="your-long-random-secret" API_FOOTBALL_KEY="your-key"
   ```

5. Deploy:

   ```bash
   fly deploy
   ```

6. Open the app:

   ```bash
   fly open
   ```

Your URL will be like `https://wc2026-predictor.fly.dev`.

### Custom domain

```bash
fly certs add yourdomain.com
```

Add the DNS records Fly prints in your registrar.

### Migrate from Render

1. Deploy on Fly (steps above).
2. **Re-register** on the new URL — Render free tier likely wiped your users already; there is nothing reliable to export from Render.
3. Share the new link with your league.
4. Delete or suspend the Render service to avoid confusion.

### Default: scale to zero (free-ish)

`fly.toml` is set to `min_machines_running = 0` — machine stops when idle, data stays on the volume.

---

## Option B — Docker (Railway, Hetzner, VPS)

```bash
docker build -t wc2026-predictor .
docker run -p 3001:3001 \
  -e JWT_SECRET=your-long-secret \
  -e DATA_DIR=/data \
  -v wc2026-data:/data \
  wc2026-predictor
```

On **Railway**: attach a volume at `/data`, set `DATA_DIR=/data`, and use a paid plan so the service does not sleep.

On a **VPS** (Hetzner, DigitalOcean, Oracle Cloud free ARM): run the same `docker run` with a named volume — always on, persistent disk, lowest long-term cost if you are comfortable with SSH.

---

## Render plans

| Setup | `render.yaml` / docs | Cold start | DB persists |
|-------|---------------------|------------|-------------|
| **Starter + disk** | `plan: starter` + `disk` in `render.yaml` | No | Yes |
| **Free + Supabase** | [DEPLOY-EASY.md](DEPLOY-EASY.md) | Yes | Yes (via backup) |
| **Free only** | Old free deploy | Yes | No |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Production | Random string for auth tokens |
| `PORT` | Auto | Set by host (Fly sets this) |
| `DATA_DIR` | Fly / Docker | SQLite folder — use `/data` with a volume |
| `NODE_ENV` | `production` | Serves built React app |
| `API_FOOTBALL_KEY` | Optional | Auto sync match results |

---

## Push to GitHub (first time)

```bash
git init
git add .
git commit -m "WC 2026 predictor"
gh repo create wc2026-predictor --public --source=. --remote=origin --push
```
