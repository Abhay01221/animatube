#!/bin/bash
# =============================================================================
# Animatube Worker — Health Check Script
# Run manually or via cron to verify worker is healthy
# =============================================================================
set -euo pipefail

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — FAILED"
    FAIL=$((FAIL + 1))
  fi
}

echo "=============================================="
echo " Animatube Worker Health Check"
echo " $(date)"
echo "=============================================="

echo ""
echo "[Process]"
check "PM2 running" "pm2 show animatube-worker | grep -q 'online'"
check "Node.js available" "node --version"
check "FFmpeg available" "ffmpeg -version"

echo ""
echo "[Environment]"
check ".env file exists" "test -f /home/animatube/app/.env"
check "REDIS_URL set" "grep -q 'REDIS_URL=' /home/animatube/app/.env"
check "DATABASE_URL set" "grep -q 'DATABASE_URL=' /home/animatube/app/.env"
check "AWS_ACCESS_KEY_ID set" "grep -q 'AWS_ACCESS_KEY_ID=' /home/animatube/app/.env"
check "GROQ_API_KEY set" "grep -q 'GROQ_API_KEY=' /home/animatube/app/.env"

echo ""
echo "[Connectivity]"
check "Upstash Redis reachable" "node -e \"
  require('dotenv').config({ path: '/home/animatube/app/.env' });
  const IORedis = require('ioredis');
  const r = new IORedis(process.env.REDIS_URL, { tls: { rejectUnauthorized: false }, connectTimeout: 5000, maxRetriesPerRequest: 1 });
  r.ping().then(() => { r.quit(); process.exit(0); }).catch(() => process.exit(1));
\""
check "Supabase DB reachable" "node -e \"
  require('dotenv').config({ path: '/home/animatube/app/.env' });
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  pool.query('SELECT 1').then(() => { pool.end(); process.exit(0); }).catch(() => process.exit(1));
\""

echo ""
echo "[Disk & Memory]"
echo "  Disk usage: $(df -h /home/animatube/app | tail -1 | awk '{print $5}') used"
echo "  RAM usage:  $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "  Swap usage: $(free -h | grep Swap | awk '{print $3 "/" $2}')"
echo "  Temp files: $(find /tmp -name 'animatube-*' -type d 2>/dev/null | wc -l) active job dirs"

echo ""
echo "=============================================="
if [ $FAIL -eq 0 ]; then
  echo " All checks passed ($PASS/$((PASS + FAIL)))"
else
  echo " $FAIL check(s) FAILED — review above"
  exit 1
fi
echo "=============================================="
