# Deploy on any VPS with Docker

Run the World Cup predictor on a small Linux server (Timeweb, Hetzner, hoster.by, Oracle, etc.).

- **Persistent SQLite** in a Docker volume (`/data` inside the container)
- **Always on** — no Render cold start
- **No Fly/Render billing** — pay your VPS provider in local currency if needed
- **Supabase not required** on VPS (optional backup only)

---

## What you need

| Item | Example |
|------|---------|
| VPS | 1 vCPU, 1 GB RAM, 10 GB disk (Ubuntu 22.04/24.04) |
| SSH access | `ssh root@YOUR_SERVER_IP` |
| Open port | **3001** (app) or **80/443** (with HTTPS, see below) |

---

## 1. Create a VPS

Pick any provider that accepts your payment method:

| Region | Examples |
|--------|----------|
| Belarus / RU | Timeweb, hoster.by, Selectel |
| EU | Hetzner (~€4/mo), DigitalOcean |
| Free tier | [Oracle Cloud](DEPLOY-ORACLE.md) (if signup works) |

Install **Ubuntu 22.04 or 24.04** and note the **public IP**.

---

## 2. Open firewall

**On the VPS** (after SSH):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3001/tcp
sudo ufw enable
```

Also open **3001** in the provider’s cloud firewall / security group if they have one.

---

## 3. Bootstrap Docker (one command)

SSH into the server, then:

```bash
curl -fsSL https://raw.githubusercontent.com/SergeiTrush/wc2026-predictor/main/scripts/vps-bootstrap.sh | bash
```

Or, if you already cloned the repo:

```bash
cd wc2026-predictor
bash scripts/vps-bootstrap.sh
```

Log out and back in (or run `newgrp docker`) so `docker` works without `sudo`.

---

## 4. Deploy the app

```bash
git clone https://github.com/SergeiTrush/wc2026-predictor.git
cd wc2026-predictor
cp .env.example .env
nano .env    # set JWT_SECRET (required), API_FOOTBALL_KEY (optional)
bash scripts/vps-deploy.sh
```

Open **http://YOUR_SERVER_IP:3001**

---

## 5. Updates

On the VPS:

```bash
cd wc2026-predictor
git pull
bash scripts/vps-deploy.sh
```

Data stays in the Docker volume `wc2026-data`.

---

## 6. HTTPS with a domain (optional)

If you have a domain (e.g. `predictor.example.com`) pointing to the server IP:

```bash
sudo apt-get install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
predictor.example.com {
    reverse_proxy localhost:3001
}
EOF
sudo systemctl reload caddy
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Replace `predictor.example.com` with your domain. Caddy obtains TLS automatically.

---

## Deploy from your laptop (without git on server)

```bash
cd prediction-app
rsync -avz --exclude node_modules --exclude data --exclude .git \
  -e ssh ./ root@YOUR_SERVER_IP:/opt/wc2026-predictor/
ssh root@YOUR_SERVER_IP 'cd /opt/wc2026-predictor && cp -n .env.example .env && bash scripts/vps-deploy.sh'
```

Edit `.env` on the server first: `ssh root@YOUR_SERVER_IP 'nano /opt/wc2026-predictor/.env'`

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Long random string for auth |
| `API_FOOTBALL_KEY` | No | Auto sync results |
| `DATA_DIR` | Auto | Set to `/data` in `docker-compose.yml` |

On VPS you do **not** need `SUPABASE_*` unless you want extra off-site backup.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect` from browser | `sudo ufw status`; provider firewall; `docker compose ps` |
| `JWT_SECRET` warning | Set a strong value in `.env`, redeploy |
| Out of memory on build | Use a 1 GB+ RAM VPS, or build locally and push image |
| Lost data | Do not run `docker compose down -v` (that deletes the volume) |

Useful commands:

```bash
docker compose logs -f --tail 100
docker compose ps
docker volume inspect wc2026-predictor_wc2026-data
```

---

## Architecture

```text
Internet → :3001 → Docker (app) → volume wc2026-data → wc2026.db
```

`docker-compose.yml` builds the image from `Dockerfile` (Node 22, Vite client, Express API).
