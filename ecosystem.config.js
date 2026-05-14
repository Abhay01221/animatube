/**
 * PM2 Ecosystem Config — Animatube Worker
 * Google Cloud VM (animatube-worker, e2-standard-2, 2 vCPU / 8GB RAM)
 *
 * Run:  pm2 start ecosystem.config.js
 * Reload: pm2 reload animatube-worker
 * Logs: pm2 logs animatube-worker
 */
module.exports = {
  apps: [
    {
      name: "animatube-worker",
      script: "npx",
      args: "tsx worker-entry.ts",
      cwd: "/home/animatube/app",

      // Single instance — BullMQ concurrency handles parallelism internally
      instances: 1,
      exec_mode: "fork",

      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,       // 5s between restarts
      min_uptime: "30s",         // Must stay up 30s to count as successful start

      // Memory limit — kill and restart if worker exceeds 6GB
      // Leaves ~2GB headroom for OS + FFmpeg child processes
      max_memory_restart: "6G",

      // Environment
      env: {
        NODE_ENV: "production",
      },

      // Logging
      out_file: "/home/animatube/logs/worker-out.log",
      error_file: "/home/animatube/logs/worker-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      log_type: "json",

      // Graceful shutdown — wait for current job to finish (up to 10 min)
      kill_timeout: 600000,       // 10 minutes
      listen_timeout: 10000,

      // Node.js flags for production stability
      node_args: [
        "--max-old-space-size=5120",   // 5GB heap max
        "--gc-interval=100",
      ],
    },
  ],
};
