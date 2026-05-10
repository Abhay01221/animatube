/**
 * YouTube Upload Worker (Job D)
 * 
 * Completely independent from video rendering.
 * Handles YouTube upload with retry logic.
 * 
 * NEVER modifies renderStatus or project completion state.
 * Only updates uploadStatus.
 */
import { Worker, Job } from "bullmq";
import { UPLOAD_QUEUE_NAME, type UploadJobData } from "../queue";
import { createRedisConnection } from "../redis";
import { prisma } from "../prisma";
import { uploadToYouTube } from "../stages/upload";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── Main upload processor ────────────────────────────────────────────────────
async function processUploadJob(job: Job<UploadJobData>): Promise<void> {
  const { jobId, userId, localFilePath, title, description, tags, visibility } = job.data;

  console.log(`\n========================================`);
  console.log(`[UploadWorker] Starting YouTube upload for job ${jobId}`);
  console.log(`[UploadWorker] User: ${userId}`);
  console.log(`[UploadWorker] Title: ${title}`);
  console.log(`[UploadWorker] Local file: ${localFilePath}`);
  console.log(`========================================\n`);

  try {
    // Update upload status to uploading
    await prisma.video.update({
      where: { jobId },
      data: { uploadStatus: "uploading" },
    });

    // Verify local file exists
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found: ${localFilePath}`);
    }

    // Create temp directory for upload process
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `animatube-upload-${jobId}-`));

    try {
      // Copy file to temp directory (upload stage expects it there)
      const tmpFilePath = path.join(tmpDir, "final_video.mp4");
      fs.copyFileSync(localFilePath, tmpFilePath);

      // Upload to YouTube
      console.log(`[UploadWorker] Uploading to YouTube...`);
      const { youtubeId, youtubeUrl } = await uploadToYouTube(
        jobId,
        userId,
        localFilePath, // Pass local file path directly
        title,
        description,
        tags,
        visibility,
        tmpDir,
        (log) => console.log(`[UploadWorker] ${log}`)
      );

      // Update database with YouTube info
      await prisma.video.update({
        where: { jobId },
        data: {
          uploadStatus: "uploaded",
          youtubeId,
          youtubeUrl,
          uploadError: null, // Clear any previous error
        },
      });

      console.log(`[UploadWorker] Upload successful!`);
      console.log(`[UploadWorker] YouTube URL: ${youtubeUrl}`);

    } finally {
      // Clean up temp directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Non-fatal
      }
    }

  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[UploadWorker] Upload failed for job ${jobId}:`, err);

    // Update upload status to failed
    // IMPORTANT: Do NOT touch renderStatus or project completion
    await prisma.video.update({
      where: { jobId },
      data: {
        uploadStatus: "failed",
        uploadError: errorMessage,
      },
    });

    // Log the error but don't throw (we don't want BullMQ to retry automatically)
    // User can manually retry from UI
    console.log(`[UploadWorker] Upload marked as failed. User can retry from dashboard.`);
  }
}

// ─── Worker instance ──────────────────────────────────────────────────────────
export function createUploadWorker() {
  const worker = new Worker<UploadJobData>(
    UPLOAD_QUEUE_NAME,
    processUploadJob,
    {
      connection: createRedisConnection(),
      concurrency: 3, // Can handle multiple uploads in parallel
    }
  );

  worker.on("completed", (job) => {
    console.log(`[UploadWorker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[UploadWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[UploadWorker] Worker error:", err);
  });

  return worker;
}
