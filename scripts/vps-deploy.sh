#!/usr/bin/env bash
# Build and start the app with Docker Compose. Run from repo root on the VPS.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Run: bash scripts/vps-bootstrap.sh"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit JWT_SECRET before production use:"
  echo "  nano .env"
fi

if grep -q 'change-me-to-a-long-random-string' .env 2>/dev/null; then
  echo "Warning: JWT_SECRET still default in .env — set a long random string."
fi

echo "Building and starting containers..."
docker compose up -d --build

echo ""
docker compose ps
echo ""

if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
  echo "Health check OK: http://127.0.0.1:3001/health"
else
  echo "Waiting for app to start..."
  sleep 5
  curl -sf http://127.0.0.1:3001/health && echo "Health check OK" || echo "Health check failed — run: docker compose logs -f"
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "App URL: http://${IP:-YOUR_SERVER_IP}:3001"
