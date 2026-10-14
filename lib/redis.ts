/**
 * Shared Redis connection for BullMQ and SSE progress.
 * Reads REDIS_URL from environment — supports rediss:// (TLS) for Upstash.
 * Lazy-initialised so missing env vars only throw at request time, not build time.
 */
import IORedis from "ioredis";

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is not set");
  }
  return url;
}

// Singleton Redis client for API routes (reused across requests)
let singletonClient: IORedis | null = null;

/**
 * Get or create a singleton Redis client for API routes.
 * This client is reused across requests to avoid reconnecting.
 * DO NOT call .quit() on this client.
 */
export function getRedisClient(): IORedis {
  if (singletonClient && singletonClient.status !== "end") {
    return singletonClient;
  }

  if (singletonClient) {
    console.log("[Redis] Existing client not ready, creating new one");
  }

  const redisUrl = getRedisUrl();
  console.log("[Redis] Connecting to:", redisUrl.replace(/:\/\/.*@/, "://<credentials>@"));

  singletonClient = new IORedis(redisUrl, {
    maxRetriesPerRequest: 2,
    commandTimeout: 15000,
    enableReadyCheck: false,
    lazyConnect: false,
    // TLS is required for rediss:// (Upstash and other managed Redis providers)
    tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: true } : undefined,
    // Production-safe retry strategy
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Connection timeout
    connectTimeout: 10000,
    // Keep connection alive
    keepAlive: 30000,
    // Reconnect on error
    reconnectOnError: (err) => {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });

  // Error handling (only log once)
  singletonClient.once("error", (err) => {
    console.error("[Redis Singleton] Connection error:", err.message);
  });

  singletonClient.once("connect", () => {
    console.log("[Redis Singleton] Connected successfully");
  });

  return singletonClient;
}

/**
 * Factory that creates a fresh IORedis connection with the correct options.
 * BullMQ requires a separate connection instance per Queue/Worker/QueueEvents,
 * so we export a factory rather than a single shared instance.
 * These connections CAN be closed with .quit() when done.
 */
export function createRedisConnection(role:"worker"|"producer"="worker"): IORedis {
  const redisUrl = getRedisUrl();
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: role==="worker"?null:2,
    ...(role==="producer"?{commandTimeout:15000}:{}),
    enableReadyCheck: false,
    // TLS is required for rediss:// (Upstash and other managed Redis providers)
    tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: true } : undefined,
    // Production-safe retry strategy
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Connection timeout
    connectTimeout: 10000,
    // Keep connection alive
    keepAlive: 30000,
    // Reconnect on error
    reconnectOnError: (err) => {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });

  return connection;
}

