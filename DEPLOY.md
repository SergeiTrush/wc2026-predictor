# Deploy

Production hosting is **VPS + Docker** only.

→ **[DEPLOY-VPS.md](DEPLOY-VPS.md)**

```bash
# on the server (Ubuntu 22/24)
git clone https://github.com/SergeiTrush/wc2026-predictor.git
cd wc2026-predictor
bash scripts/vps-bootstrap.sh   # once, then log out/in
cp .env.example .env && nano .env
bash scripts/vps-deploy.sh
```

Open **http://YOUR_SERVER_IP:3001**

Oracle free VM notes: **[DEPLOY-ORACLE.md](DEPLOY-ORACLE.md)** (same Docker steps).

Other platforms (Render, Fly) are not used — see [docs/legacy-hosting](docs/legacy-hosting/README.md) if needed.
