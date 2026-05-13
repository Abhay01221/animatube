/**
 * BullMQ queue setup.
 * All Redis connections are created via createRedisConnection() from lib/redis.ts
 * which reads REDIS_URL and handles TLS automatically for rediss:// URLs.
 *
 * Queues are lazy-initialised so missing env vars only throw at runtime
 * (when a request actually enqueues a job), not at Vercel build time.
 */
import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "./redis";

// Queue names for different job types
export const VIDEO_QUEUE_NAME = "video-generation";
export const UPLOAD_QUEUE_NAME = "youtube-upload";

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
  // Re-upload fields (optional)
  reuploadOnly?: boolean;
  finalVideoS3Key?: string;
  title?: string;
  description?: string;
  tags?: string[];
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

// ─── Lazy singletons ──────────────────────────────────────────────────────────

let _videoQueue: Queue | null = null;
let _uploadQueue: Queue | null = null;
let _videoQueueEvents: QueueEvents | null = null;
let _uploadQueueEvents: QueueEvents | null = null;

/** Video rendering queue — lazy getter, safe to import at build time. */
export function getVideoQueue(): Queue {
  if (!_videoQueue) {
    _videoQueue = new Queue(VIDEO_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400 }, // keep 24 h
        removeOnFail: { age: 86400 },
      },
    });
  }
  return _videoQueue;
}

/** YouTube upload queue — lazy getter, safe to import at build time. */
export function getUploadQueue(): Queue {
  if (!_uploadQueue) {
    _uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5, // More retries for uploads (network issues)
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: { age: 86400 * 7 }, // keep 7 days
        removeOnFail: { age: 86400 * 7 },
      },
    });
  }
  return _uploadQueue;
}

/** Video queue events — lazy getter. */
export function getVideoQueueEvents(): QueueEvents {
  if (!_videoQueueEvents) {
    _videoQueueEvents = new QueueEvents(VIDEO_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return _videoQueueEvents;
}

/** Upload queue events — lazy getter. */
export function getUploadQueueEvents(): QueueEvents {
  if (!_uploadQueueEvents) {
    _uploadQueueEvents = new QueueEvents(UPLOAD_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return _uploadQueueEvents;
}

/**
 * @deprecated Use getVideoQueue() instead.
 * Kept as a re-export so existing worker files that import { videoQueue }
 * continue to compile — workers run on Railway where REDIS_URL is always set.
 */
export const videoQueue = new Proxy({} as Queue, {
  get(_t, prop) {
    return (getVideoQueue() as any)[prop];
  },
});

/**
 * @deprecated Use getUploadQueue() instead.
 * Kept as a re-export so existing worker files that import { uploadQueue }
 * continue to compile — workers run on Railway where REDIS_URL is always set.
 */
export const uploadQueue = new Proxy({} as Queue, {
  get(_t, prop) {
    return (getUploadQueue() as any)[prop];
  },
});
