#!/bin/bash
# =============================================================================
# Animatube Worker — Deploy / Update Script
# Run as 'animatube' user on the GCP VM
# Usage: ./scripts/deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="/home/animatube/app"
LOG_DIR="/home/animatube/logs"

echo "=============================================="
echo " Animatube Worker Deploy"
echo " $(date)"
echo "=============================================="

# ── Verify .env exists ────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: $APP_DIR/.env not found"
  echo "Copy your .env file to $APP_DIR/.env before deploying"
  exit 1
fi

cd "$APP_DIR"

# ── Pull latest code ──────────────────────────────────────────────────────────
echo "[1/5] Pulling latest code from main..."
git fetch origin main
git reset --hard origin/main
echo "Code updated to: $(git log --oneline -1)"

# ── Install dependencies ──────────────────────────────────────────────────────
echo "[2/5] Installing dependencies..."
npm ci --prefer-offline

# ── Generate Prisma client ────────────────────────────────────────────────────
echo "[3/5] Generating Prisma client..."
npx prisma generate

# ── Start or reload PM2 ──────────────────────────────────────────────────────
echo "[4/5] Starting/reloading PM2 worker..."
if pm2 show animatube-worker > /dev/null 2>&1; then
  echo "Worker running — performing zero-downtime reload..."
  pm2 reload animatube-worker --update-env
else
  echo "Worker not running — starting fresh..."
  pm2 start ecosystem.config.js
fi

# Save PM2 process list so it survives reboots
pm2 save

# ── Verify ────────────────────────────────────────────────────────────────────
echo "[5/5] Verifying worker status..."
sleep 5
pm2 show animatube-worker

echo ""
echo "=============================================="
echo " Deploy complete!"
echo " Logs: pm2 logs animatube-worker"
echo "=============================================="
