#!/usr/bin/env bash
# Install Docker on Ubuntu (22.04/24.04). Run on the VPS as root or with sudo.
set -euo pipefail

if command -v docker >/dev/null 2>&1; then
  echo "Docker already installed: $(docker --version)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git

curl -fsSL https://get.docker.com | sh

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
  usermod -aG docker "$SUDO_USER"
  echo "Added $SUDO_USER to group docker — log out and back in."
fi

apt-get install -y -qq docker-compose-plugin 2>/dev/null || true

echo "Done. Docker: $(docker --version)"
echo "Next: clone repo, copy .env.example → .env, run scripts/vps-deploy.sh"
