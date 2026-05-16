#!/bin/bash
# =============================================================================
# Animatube Worker — GCP VM Setup Script
# Run as root on a fresh Ubuntu 24.04 LTS VM
# VM: animatube-worker, e2-standard-2, asia-south1
# =============================================================================
set -euo pipefail

echo "=============================================="
echo " Animatube Worker VM Setup"
echo " Ubuntu 24.04 LTS | 2 vCPU | 8GB RAM"
echo "=============================================="

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/10] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip build-essential \
  python3 make g++ \
  fail2ban ufw \
  htop iotop nethogs \
  logrotate

# ── 2. Create non-root deployment user ───────────────────────────────────────
echo "[2/10] Creating deployment user 'animatube'..."
if ! id "animatube" &>/dev/null; then
  useradd -m -s /bin/bash animatube
  echo "User 'animatube' created"
else
  echo "User 'animatube' already exists"
fi

# Create required directories
mkdir -p /home/animatube/{app,logs,.ssh}
chown -R animatube:animatube /home/animatube

# ── 3. SSH hardening ──────────────────────────────────────────────────────────
echo "[3/10] Hardening SSH..."
cat >> /etc/ssh/sshd_config << 'EOF'

# Animatube hardening
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
systemctl restart sshd

# ── 4. Firewall setup ─────────────────────────────────────────────────────────
echo "[4/10] Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment "SSH"
# Worker does NOT expose any HTTP ports — it only connects outbound to:
# - Upstash Redis (TLS 6379)
# - Supabase PostgreSQL (5432)
# - AWS S3 (443)
# - Groq API (443)
# - Pexels API (443)
# - YouTube API (443)
ufw --force enable
echo "Firewall configured — only SSH inbound allowed"

# ── 5. fail2ban ───────────────────────────────────────────────────────────────
echo "[5/10] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
systemctl enable fail2ban
systemctl restart fail2ban

# ── 6. Node.js 22 ─────────────────────────────────────────────────────────────
echo "[6/10] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version
npm --version

# ── 7. FFmpeg ─────────────────────────────────────────────────────────────────
echo "[7/10] Installing FFmpeg..."
apt-get install -y ffmpeg
ffmpeg -version | head -1

# ── 8. PM2 ────────────────────────────────────────────────────────────────────
echo "[8/10] Installing PM2..."
npm install -g pm2
pm2 --version

# Configure PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss

# ── 9. Swap space (OOM prevention for FFmpeg) ─────────────────────────────────
echo "[9/10] Configuring 4GB swap for FFmpeg OOM prevention..."
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Reduce swappiness — only use swap when RAM is nearly full
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p
  echo "4GB swap configured"
else
  echo "Swap already exists"
fi

# ── 10. Temp directory cleanup cron ──────────────────────────────────────────
echo "[10/10] Configuring temp file cleanup..."
cat > /etc/cron.d/animatube-cleanup << 'EOF'
# Clean animatube temp files older than 2 hours every 30 minutes
*/30 * * * * animatube find /tmp -name "animatube-*" -type d -mmin +120 -exec rm -rf {} + 2>/dev/null || true
EOF

echo ""
echo "=============================================="
echo " VM setup complete!"
echo " Next: run scripts/deploy.sh as 'animatube' user"
echo "=============================================="
