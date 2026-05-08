/**
 * BullMQ queue setup.
 * All Redis connections are created via createRedisConnection() from lib/redis.ts
 * which reads REDIS_URL and handles TLS automatically for rediss:// URLs.
 */
import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "./redis";

export const VIDEO_QUEUE_NAME = "video-generation";

// The queue used by API routes to add jobs
export const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 }, // keep 24 h
    removeOnFail: { age: 86400 },
  },
});

// QueueEvents lets API routes listen for job completion/failure
export const videoQueueEvents = new QueueEvents(VIDEO_QUEUE_NAME, {
  connection: createRedisConnection(),
});

export interface VideoJobData {
  jobId: string; // matches Video.jobId in DB
  userId: string;
  prompt: string;
  style: string;
  duration: string; // "short" | "long"
  voice: string; // voice preference (male | female | ai_narrator)
  language: string;
  visibility: string;
}
