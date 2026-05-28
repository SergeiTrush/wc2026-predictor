# Legacy: Render free + Supabase

**Not used.** Production deploy: [DEPLOY-VPS.md](../../DEPLOY-VPS.md).

---

**Use this only if you still host on Render.**

---

## Step 0 — Deploy backup code to Render (required first)

The Supabase backup lives in `server/db-backup.js`. Render must run this code.

From `prediction-app/`:

```bash
git add server/db-backup.js server/db-backup-upload.js server/db.js .env.example DEPLOY-EASY.md
git commit -m "Persist SQLite to Supabase across Render cold starts"
git push origin main
```

Wait until Render finishes **Deploy** (green in dashboard).  
If you skip this step, env vars alone will not fix logins.

---

## Step 1 — Create Supabase project

1. Open **[supabase.com](https://supabase.com)** → sign in (GitHub is fine).
2. Click **New project**.
3. Fill in:
   - **Name:** e.g. `wc2026-predictor`
   - **Database password:** save it somewhere (you need it for the Supabase dashboard; the app does not use Postgres directly)
   - **Region:** pick closest to you (e.g. `eu-central-1`)
4. Click **Create new project** and wait until status is **Active** (~2 minutes).

---

## Step 2 — Create storage bucket

1. In the left sidebar, open **Storage**.
2. Click **New bucket**.
3. **Name:** `app-db` (must match exactly, or change `SUPABASE_DB_BUCKET` on Render).
4. Turn **Public bucket** **OFF** (private).
5. Click **Create bucket**.

You should see an empty bucket named `app-db`.

---

## Step 3 — Copy API keys

1. Left sidebar → **Project Settings** (gear icon at bottom).
2. Click **API**.
3. Copy these two values:

| Copy this | Use as Render env var |
|-----------|------------------------|
| **Project URL** (e.g. `https://abcdefgh.supabase.co`) | `SUPABASE_URL` |
| **service_role** key under **Project API keys** (click Reveal) | `SUPABASE_SERVICE_ROLE_KEY` |

**Important:** Use **service_role**, not `anon`. Never put `service_role` in the React client or commit it to GitHub.

---

## Step 4 — Add environment variables on Render

1. Open **[dashboard.render.com](https://dashboard.render.com/)**.
2. Click your service (e.g. **wc2026-predictor**).
3. Left menu → **Environment**.
4. Click **Add Environment Variable** for each row:

| Key | Value |
|-----|--------|
| `SUPABASE_URL` | Paste Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Paste service_role key |
| `SUPABASE_DB_BUCKET` | `app-db` |

5. Click **Save Changes**. Render starts a new deploy automatically.

Do **not** remove `JWT_SECRET` or `API_FOOTBALL_KEY` if they are already set.

---

## Step 5 — Verify in Render logs

1. Service → **Logs**.
2. After deploy, within ~1 minute you should see:

   ```text
   DB backup to Supabase every 60s
   WC 2026 Predictor API on http://localhost:...
   ```

3. If you see `DB backup failed`, check bucket name `app-db` and that you used **service_role**.

4. Optional: in Supabase → **Storage** → **app-db** — after ~1 min a file **`wc2026.db`** should appear.

---

## Step 6 — Register and test

1. Open **https://wc2026-predictor-2dqu.onrender.com/** (your Render URL).
2. **Register** a new account (old accounts from before backup are gone).
3. Use the app normally for a minute (so a backup runs).
4. Test persistence:
   - Wait 20+ minutes without visiting, **or** in Render → **Settings** → suspend/wake the service.
   - Open the site again (may take 30–60 s to wake on free tier).
   - **Log in** with the same name/password — should work.

---

## Checklist

- [ ] Pushed `db-backup` code to GitHub; Render deploy succeeded  
- [ ] Supabase project active, bucket `app-db` created  
- [ ] Three env vars on Render saved  
- [ ] Logs show `DB backup to Supabase every 60s`  
- [ ] File `wc2026.db` visible in Supabase Storage (after ~1 min)  
- [ ] Registered **after** backup was enabled  
- [ ] Login works after cold start  

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| No `DB backup` line in logs | Code not deployed — redo Step 0; confirm latest commit on Render **Events** tab |
| `DB backup failed` | Wrong bucket name; wrong key (use service_role); bucket must exist |
| `Restored SQLite` but login fails | Register again **after** first successful backup |
| Supabase signup blocked | Try Google/GitHub login; different browser; friend creates project and shares URL + service_role |
| `wc2026.db` never appears | Check logs for backup errors; confirm env var names spelled exactly |

---

## Local `.env` (optional)

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_BUCKET=app-db
```

Same backup runs locally when these are set.
