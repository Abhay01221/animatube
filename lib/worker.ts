/**
 * BullMQ Worker — processes video generation jobs.
 * Each job runs all 6 stages sequentially, emitting progress updates
 * that are stored in Redis and streamed to the frontend via SSE.
 *
 * Run this as a separate process: `npx ts-node worker-entry.ts`
 */
import { Worker, Job } from "bullmq";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { VIDEO_QUEUE_NAME, type VideoJobData } from "./queue";
import { createRedisConnection } from "./redis";
import { prisma } from "./prisma";
import { generateScript } from "./stages/script";
import { generateVoiceover, VOICE_MAP } from "./stages/voice";
import { fetchVisuals } from "./stages/visuals";
import { assembleVideo } from "./stages/assemble";
import { addSubtitles } from "./stages/subtitles";
import { uploadToYouTube } from "./stages/upload";

// ─── Stage definitions ────────────────────────────────────────────────────────
export type StageStatus = "pending" | "active" | "done" | "error";

export interface StageUpdate {
  stage: number; // 1-6
  name: string;
  status: StageStatus;
  log?: string;
}

const STAGE_NAMES = [
  "Writing script",
  "Generating voiceover",
  "Fetching visuals",
  "Assembling video",
  "Adding subtitles",
  "Uploading to YouTube",
];

// ─── Redis for SSE progress storage ──────────────────────────────────────────
const progressRedis = createRedisConnection();

/** Publish a stage update to Redis (SSE clients poll/subscribe). */
async function publishProgress(
  jobId: string,
  update: StageUpdate
): Promise<void> {
  const key = `progress:${jobId}`;
  // Append to a list; SSE handler reads from this list
  await progressRedis.rpush(key, JSON.stringify(update));
  await progressRedis.expire(key, 86400); // 24h TTL
  // Also publish to a channel for real-time SSE
  await progressRedis.publish(`progress-channel:${jobId}`, JSON.stringify(update));
}

/** Mark a stage as active and log a message. */
async function stageActive(
  jobId: string,
  stage: number,
  log?: string
): Promise<void> {
  await publishProgress(jobId, {
    stage,
    name: STAGE_NAMES[stage - 1],
    status: "active",
    log,
  });
}

/** Mark a stage as done. */
async function stageDone(jobId: string, stage: number): Promise<void> {
  await publishProgress(jobId, {
    stage,
    name: STAGE_NAMES[stage - 1],
    status: "done",
  });
}

/** Mark a stage as errored. */
async function stageError(
  jobId: string,
  stage: number,
  error: string
): Promise<void> {
  await publishProgress(jobId, {
    stage,
    name: STAGE_NAMES[stage - 1],
    status: "error",
    log: error,
  });
}

// ─── Main job processor ───────────────────────────────────────────────────────
async function processVideoJob(job: Job<VideoJobData>): Promise<void> {
  const { jobId, userId, prompt, style, duration, voice, language, visibility } =
    job.data;

  console.log(`\n========================================`);
  console.log(`[Worker] Starting job ${jobId}`);
  console.log(`[Worker] User: ${userId}`);
  console.log(`[Worker] Prompt: ${prompt}`);
  console.log(`[Worker] Style: ${style}, Duration: ${duration}, Voice: ${voice}`);
  console.log(`========================================\n`);

  // Create a temp directory for this job
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `animatube-${jobId}-`));
  console.log(`[Worker] Temp directory: ${tmpDir}`);

  try {
    // Update DB status
    await prisma.video.update({
      where: { jobId },
      data: { status: "processing" },
    });

    // ── Stage 1: Script ──────────────────────────────────────────────────────
    console.log(`[Stage 1] Starting script generation for job ${jobId}`);
    await stageActive(jobId, 1, `Writing ${duration} ${style} script`);
    const script = await generateScript(
      jobId,
      prompt,
      style,
      duration,
      language,
      (log) => publishProgress(jobId, { stage: 1, name: STAGE_NAMES[0], status: "active", log })
    );
    await prisma.video.update({
      where: { jobId },
      data: {
        scriptJson: script as object,
        title: script.title,
        description: script.description,
        tags: script.tags,
      },
    });
    console.log(`[Stage 1] Success - Script: "${script.title}" (${script.script.length} segments)`);
    await stageDone(jobId, 1);

    // ── Stage 2: Voiceover ───────────────────────────────────────────────────
    console.log(`[Stage 2] Starting voiceover generation for job ${jobId}`);
    await stageActive(jobId, 2, "Generating voiceover audio");
    const resolvedVoiceId = VOICE_MAP[voice] ?? voice;
    console.log(`[Stage 2] Voice: ${resolvedVoiceId}`);
    const { s3Key: voiceS3Key, durationSeconds } = await generateVoiceover(
      jobId,
      script.script,
      resolvedVoiceId,
      (log) => publishProgress(jobId, { stage: 2, name: STAGE_NAMES[1], status: "active", log })
    );
    await prisma.video.update({
      where: { jobId },
      data: { s3VoiceUrl: voiceS3Key },
    });
    console.log(`[Stage 2] Success - S3 Key: ${voiceS3Key}, Duration: ${durationSeconds.toFixed(1)}s`);
    await stageDone(jobId, 2);

    // ── Stage 3: Visuals ─────────────────────────────────────────────────────
    console.log(`[Stage 3] Starting visual fetching for job ${jobId}`);
    console.log(`[Stage 3] Temp directory: ${tmpDir}`);
    await stageActive(jobId, 3, "Fetching stock footage and images");
    const timeline = await fetchVisuals(
      jobId,
      script.script,
      durationSeconds,
      tmpDir,
      (log) => publishProgress(jobId, { stage: 3, name: STAGE_NAMES[2], status: "active", log })
    );
    console.log(`[Stage 3] Success - Fetched ${timeline.length} visuals`);
    await stageDone(jobId, 3);

    // ── Stage 4: Assembly ────────────────────────────────────────────────────
    console.log(`[Stage 4] Starting video assembly for job ${jobId}`);
    console.log(`[Stage 4] Voice S3 Key: ${voiceS3Key}`);
    await stageActive(jobId, 4, "Assembling video with FFmpeg");
    const rawVideoS3Key = await assembleVideo(
      jobId,
      timeline,
      voiceS3Key,
      tmpDir,
      (log) => publishProgress(jobId, { stage: 4, name: STAGE_NAMES[3], status: "active", log })
    );
    await prisma.video.update({
      where: { jobId },
      data: { s3RawVideoUrl: rawVideoS3Key },
    });
    console.log(`[Stage 4] Success - Raw video S3 Key: ${rawVideoS3Key}`);
    await stageDone(jobId, 4);

    // ── Stage 5: Subtitles ───────────────────────────────────────────────────
    console.log(`[Stage 5] Starting subtitle burn-in for job ${jobId}`);
    console.log(`[Stage 5] Raw video S3 Key: ${rawVideoS3Key}`);
    await stageActive(jobId, 5, "Burning subtitles into video");
    const finalVideoS3Key = await addSubtitles(
      jobId,
      script.script,
      timeline,
      rawVideoS3Key,
      tmpDir,
      (log) => publishProgress(jobId, { stage: 5, name: STAGE_NAMES[4], status: "active", log })
    );
    await prisma.video.update({
      where: { jobId },
      data: { s3VideoUrl: finalVideoS3Key },
    });
    console.log(`[Stage 5] Success - Final video S3 Key: ${finalVideoS3Key}`);
    await stageDone(jobId, 5);

    // ── Stage 6: YouTube Upload ──────────────────────────────────────────────
    await stageActive(jobId, 6, "Uploading to YouTube");
    console.log(`[Stage 6] Final video uploaded to S3: ${finalVideoS3Key}`);
    console.log(`[Stage 6] Generated download URL available`);
    
    try {
      const { youtubeId, youtubeUrl } = await uploadToYouTube(
        jobId,
        userId,
        finalVideoS3Key,
        script.title,
        script.description,
        script.tags,
        visibility,
        tmpDir,
        (log) => publishProgress(jobId, { stage: 6, name: STAGE_NAMES[5], status: "active", log })
      );
      await stageDone(jobId, 6);

      // ── Complete with YouTube upload ───────────────────────────────────────
      await prisma.video.update({
        where: { jobId },
        data: { status: "completed", youtubeId, youtubeUrl },
      });

      // Publish completion event
      await publishProgress(jobId, {
        stage: 6,
        name: "complete",
        status: "done",
        log: youtubeUrl,
      });
    } catch (uploadErr) {
      // YouTube upload failed, but video is still available for download
      const uploadError = (uploadErr as Error).message;
      console.error(`[Stage 6] YouTube upload failed: ${uploadError}`);
      console.log(`[Stage 6] Video is still available for download from S3`);
      
      await stageError(jobId, 6, `YouTube upload failed: ${uploadError}. Video is available for download.`);
      
      // Mark as completed with upload failure
      await prisma.video.update({
        where: { jobId },
        data: { 
          status: "completed",
          errorMessage: `YouTube upload failed: ${uploadError}. Video is available for download.`
        },
      });

      // Publish completion event (with warning)
      await publishProgress(jobId, {
        stage: 6,
        name: "complete",
        status: "done",
        log: "Video generated successfully. YouTube upload failed - please retry or download the video.",
      });
    }
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[Worker] Job ${jobId} failed:`, err);

    await prisma.video.update({
      where: { jobId },
      data: { status: "failed", errorMessage },
    });

    // Determine which stage failed
    const currentStage = await getCurrentStage(jobId);
    await stageError(jobId, currentStage, errorMessage);

    throw err; // Let BullMQ handle retries
  } finally {
    // Always clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-fatal
    }
  }
}

/** Determine the last active stage from Redis progress list. */
async function getCurrentStage(jobId: string): Promise<number> {
  const key = `progress:${jobId}`;
  const entries = await progressRedis.lrange(key, 0, -1);
  let lastStage = 1;
  for (const entry of entries) {
    try {
      const update = JSON.parse(entry) as StageUpdate;
      if (update.status === "active") lastStage = update.stage;
    } catch {
      // ignore
    }
  }
  return lastStage;
}

// ─── Worker instance ──────────────────────────────────────────────────────────
export function createWorker() {
  const worker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAME,
    processVideoJob,
    {
      connection: createRedisConnection(),
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err);
  });

  return worker;
}
