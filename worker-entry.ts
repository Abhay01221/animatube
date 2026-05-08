/**
 * Worker entry point — run this as a separate process:
 *   npx tsx worker-entry.ts
 *
 * This process handles all video generation jobs from BullMQ.
 */
import dotenv from "dotenv";
import path from "path";

// Load .env before importing anything else — must be first
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createWorker } from "./lib/worker";

console.log("[Worker] Starting Animatube video generation worker...");
console.log("[Worker] GROQ_API_KEY present:", !!process.env.GROQ_API_KEY);
console.log("[Worker] DATABASE_URL present:", !!process.env.DATABASE_URL);
console.log("[Worker] AWS_S3_BUCKET:", process.env.AWS_S3_BUCKET);

const worker = createWorker();

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down gracefully...");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[Worker] Worker ready, waiting for jobs...");
