/**
 * Worker entry point — run this as a separate process:
 *   npx tsx worker-entry.ts
 *
 * This process handles both video rendering and YouTube upload jobs.
 */
import dotenv from "dotenv";
import path from "path";

// Load .env before importing anything else — must be first
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { createVideoWorker } from "./lib/workers/video-worker";
import { createUploadWorker } from "./lib/workers/upload-worker";

console.log("[Worker] Starting Animatube workers...");
console.log("[Worker] GROQ_API_KEY present:", !!process.env.GROQ_API_KEY);
console.log("[Worker] DATABASE_URL present:", !!process.env.DATABASE_URL);
console.log("[Worker] AWS_S3_BUCKET:", process.env.AWS_S3_BUCKET);

// Start both workers
const videoWorker = createVideoWorker();
const uploadWorker = createUploadWorker();

console.log("[Worker] Video rendering worker started");
console.log("[Worker] YouTube upload worker started");

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down gracefully...");
  await videoWorker.close();
  await uploadWorker.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[Worker] Workers ready, waiting for jobs...");

