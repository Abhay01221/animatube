/**
 * BullMQ queue setup.
 * All Redis connections are created via createRedisConnection() from lib/redis.ts
 * which reads REDIS_URL and handles TLS automatically for rediss:// URLs.
 */
import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "./redis";

// Queue names for different job types
export const VIDEO_QUEUE_NAME = "video-generation";
export const UPLOAD_QUEUE_NAME = "youtube-upload";

// Video rendering queue (Jobs A-C: render, subtitles, save)
export const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400 }, // keep 24 h
    removeOnFail: { age: 86400 },
  },
});

// YouTube upload queue (Job D: upload - completely independent)
export const uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5, // More retries for uploads (network issues)
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { age: 86400 * 7 }, // keep 7 days
    removeOnFail: { age: 86400 * 7 },
  },
});

// QueueEvents for monitoring
export const videoQueueEvents = new QueueEvents(VIDEO_QUEUE_NAME, {
  connection: createRedisConnection(),
});

export const uploadQueueEvents = new QueueEvents(UPLOAD_QUEUE_NAME, {
  connection: createRedisConnection(),
});

// Job data interfaces
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

export interface UploadJobData {
  jobId: string; // matches Video.jobId in DB
  userId: string;
  localFilePath: string; // Path to final MP4
  title: string;
  description: string;
  tags: string[];
  visibility: string;
}

