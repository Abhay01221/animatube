/**
 * Worker Entry Point
 * 
 * Starts BullMQ workers for video generation.
 * Run this as a separate process from the Next.js frontend.
 * 
 * Usage:
 *   npm run worker
 *   OR
 *   npx tsx worker-entry.ts
 */
import { createWorker } from "./lib/worker";

console.log("========================================");
console.log("🚀 Animatube Worker Starting");
console.log("========================================");
console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`Redis URL: ${process.env.REDIS_URL?.replace(/:\/\/.*@/, "://<credentials>@")}`);
console.log(`Database: ${process.env.DATABASE_URL?.split("@")[1] || "not configured"}`);
console.log(`S3 Bucket: ${process.env.AWS_S3_BUCKET || "not configured"}`);
console.log("========================================\n");

// Create and start worker
const worker = createWorker();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("\n⚠️  SIGTERM received, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\n⚠️  SIGINT received, shutting down gracefully...");
  await worker.close();
  process.exit(0);
});

console.log("✅ Worker is running and waiting for jobs...\n");
