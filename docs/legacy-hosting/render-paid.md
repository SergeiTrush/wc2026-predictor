# Legacy: Render Starter + disk

**Not used.** Production deploy: [DEPLOY-VPS.md](../../DEPLOY-VPS.md).

---

Fixes both problems on Render:

- **No cold sleep** — Starter instances stay running
- **No wiped database** — SQLite on a persistent disk at `/var/data`

**Cost (approx.):** ~$7/mo (Starter) + ~$0.25/mo (1 GB disk) ≈ **$7–8/mo total**.

The repo `render.yaml` is already configured for this. Use either **Blueprint sync** or **manual dashboard** steps below.

---

## Option A — Upgrade existing service (dashboard)

Do this if you already deploy at `wc2026-predictor-2dqu.onrender.com` (or similar).

### 1. Upgrade plan

1. [Render Dashboard](https://dashboard.render.com/) → your web service
2. **Settings** → **Instance type**
3. Select **Starter** ($7/mo) → **Save changes**

### 2. Add persistent disk

1. Same service → **Disks** (left menu) → **Add disk**
2. Settings:
   - **Mount path:** `/var/data`
   - **Size:** `1` GB (enough for SQLite; you can increase later, not decrease)
3. **Add disk** — Render redeploys automatically

### 3. Set environment variable

1. **Environment** → add or edit:

   | Key | Value |
   |-----|--------|
   | `DATA_DIR` | `/var/data` |

2. Keep existing `JWT_SECRET`, `API_FOOTBALL_KEY`, etc.
3. **Remove** Supabase backup vars if you added them earlier (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — not needed with a disk.

### 4. Push latest code & redeploy

```bash
git add render.yaml server/db.js
git commit -m "Render Starter + persistent disk at /var/data"
git push
```

Trigger **Manual Deploy** if Render does not auto-deploy.

### 5. Verify

**Logs** after deploy should show:

```text
WC 2026 Predictor API on http://localhost:...
```

No `Restored SQLite from Supabase` unless Supabase vars are still set.

**Test:**

1. Register / log in
2. Wait a day or use **Manual Suspend** then wake the service (Settings)
3. Log in again — should still work
4. First page load should be **fast** (no long Render “waking up” page)

---

## Option B — New deploy from Blueprint

1. Push repo with updated `render.yaml`
2. Render → **New** → **Blueprint** → connect repo
3. Set `API_FOOTBALL_KEY` and confirm `JWT_SECRET` when prompted
4. Deploy

---

## How it works in code

`server/db.js` uses:

```text
DATA_DIR → /var/data → wc2026.db
```

Only files under `/var/data` survive deploys and restarts. The rest of the filesystem is still ephemeral (built app, `node_modules`, etc.).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Disk not mounting | Mount path must be exactly `/var/data`; redeploy after adding disk |
| Still see cold-start splash | Confirm **Starter**, not Free, under Instance type |
| Login lost after deploy | Check `DATA_DIR=/var/data` in Environment; disk attached to **this** service |
| “Disk only on paid plans” | Upgrade to Starter first, then add disk |

---

## Cheaper alternative (free Render)

If you do not want to pay: [DEPLOY-EASY.md](DEPLOY-EASY.md) (Render free + Supabase backup — cold start remains, logins persist).
