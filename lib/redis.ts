/**
 * Shared Redis connection for BullMQ and SSE progress.
 * Reads REDIS_URL from environment — supports rediss:// (TLS) for Upstash.
 */
import dotenv from "dotenv";
import path from "path";
import IORedis from "ioredis";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL environment variable is not set");
}

console.log("[Redis] Connecting to:", redisUrl.replace(/:\/\/.*@/, "://<credentials>@"));

/**
 * Factory that creates a fresh IORedis connection with the correct options.
 * BullMQ requires a separate connection instance per Queue/Worker/QueueEvents,
 * so we export a factory rather than a single shared instance.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(redisUrl!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // TLS is required for rediss:// (Upstash and other managed Redis providers)
    tls: redisUrl!.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  });
}
