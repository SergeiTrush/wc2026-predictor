#!/usr/bin/env bash
# Deploy to Fly.io with persistent volume (scale to zero).
# Requires: flyctl, fly auth login, credit card on Fly billing.
set -euo pipefail
cd "$(dirname "$0")/.."

APP=wc2026-predictor
REGION=ams
VOLUME=wc2026_data

if ! fly auth whoami &>/dev/null; then
  echo "Run: fly auth login"
  exit 1
fi

if ! fly apps list 2>/dev/null | grep -q "$APP"; then
  fly apps create "$APP"
fi

if ! fly volumes list -a "$APP" 2>/dev/null | grep -q "$VOLUME"; then
  fly volumes create "$VOLUME" --region "$REGION" --size 1 -a "$APP" -y
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  if [[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == change-me* ]]; then
    echo "Set JWT_SECRET in .env before deploying."
    exit 1
  fi
  SECRETS=(JWT_SECRET="$JWT_SECRET")
  [[ -n "${API_FOOTBALL_KEY:-}" ]] && SECRETS+=(API_FOOTBALL_KEY="$API_FOOTBALL_KEY")
  [[ -n "${API_FOOTBALL_LEAGUE_ID:-}" ]] && SECRETS+=(API_FOOTBALL_LEAGUE_ID="$API_FOOTBALL_LEAGUE_ID")
  [[ -n "${API_FOOTBALL_SEASON:-}" ]] && SECRETS+=(API_FOOTBALL_SEASON="$API_FOOTBALL_SEASON")
  fly secrets set "${SECRETS[@]}" -a "$APP"
else
  echo "Warning: no .env — set secrets manually: fly secrets set JWT_SECRET=... -a $APP"
fi

fly deploy -a "$APP"
echo ""
fly status -a "$APP"
echo ""
echo "Open: https://${APP}.fly.dev"
