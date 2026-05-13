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
import { generateCinematicScript } from "./stages/cinematic-script";
import { generateVoiceover, VOICE_MAP } from "./stages/voice";
import { fetchCinematicVisuals } from "./stages/cinematic-visuals";
import { assembleCinematicVideo } from "./stages/cinematic-assembly";
import { addCinematicSubtitles } from "./stages/cinematic-subtitles";
import { uploadToYouTube } from "./stages/upload";
import { uploadFinalVideoToStorage, cleanupTempFiles } from "./storage";

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

    // ── Stage 1: Cinematic Script (Story Plan + Scene Script) ────────────────
    console.log(`[Stage 1] Starting cinematic script generation for job ${jobId}`);
    await stageActive(jobId, 1, `Planning cinematic ${duration} ${style} story`);
    
    // Use cinematic script generation (story plan + scene script)
    const { storyPlan, script: cinematicScript } = await generateCinematicScript(
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
        scenes: cinematicScript.scenes as any,
        characters: cinematicScript.characters ? (cinematicScript.characters as any) : null,
        scriptJson: cinematicScript as any,
        title: cinematicScript.title,
        description: cinematicScript.description,
        tags: cinematicScript.tags,
      },
    });
    
    console.log(`[Stage 1] Success - Cinematic Script: "${cinematicScript.title}" (${cinematicScript.scenes.length} scenes)`);
    await stageDone(jobId, 1);

    // ── Stage 2: Voiceover ───────────────────────────────────────────────────
    console.log(`[Stage 2] Starting voiceover generation for job ${jobId}`);
    await stageActive(jobId, 2, "Generating voiceover audio");
    const resolvedVoiceId = VOICE_MAP[voice] ?? voice;
    console.log(`[Stage 2] Voice: ${resolvedVoiceId}`);
    
    const { s3Key: voiceS3Key, durationSeconds } = await generateVoiceover(
      jobId,
      cinematicScript.scenes.map(s => ({ segment: s.narration, duration_seconds: s.duration_seconds, visual_cue: s.visual_prompt })),
      resolvedVoiceId,
      (log) => publishProgress(jobId, { stage: 2, name: STAGE_NAMES[1], status: "active", log })
    );
    
    await prisma.video.update({
      where: { jobId },
      data: { s3VoiceUrl: voiceS3Key },
    });
    console.log(`[Stage 2] Success - S3 Key: ${voiceS3Key}, Duration: ${durationSeconds.toFixed(1)}s`);
    await stageDone(jobId, 2);

    // ── Stage 3: Cinematic Visuals ───────────────────────────────────────────
    console.log(`[Stage 3] Starting cinematic visual fetching for job ${jobId}`);
    console.log(`[Stage 3] Temp directory: ${tmpDir}`);
    await stageActive(jobId, 3, "Fetching cinematic stock footage and images");
    
    const timeline = await fetchCinematicVisuals(
      jobId,
      cinematicScript.scenes,
      cinematicScript.characters,
      durationSeconds,
      tmpDir,
      (log) => publishProgress(jobId, { stage: 3, name: STAGE_NAMES[2], status: "active", log })
    );
    
    console.log(`[Stage 3] Success - Fetched ${timeline.length} cinematic visuals`);
    await stageDone(jobId, 3);

    // ── Stage 4: Cinematic Assembly ──────────────────────────────────────────
    console.log(`[Stage 4] Starting cinematic video assembly for job ${jobId}`);
    console.log(`[Stage 4] Voice S3 Key: ${voiceS3Key}`);
    await stageActive(jobId, 4, "Assembling cinematic video with motion effects");
    
    const rawVideoS3Key = await assembleCinematicVideo(
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
    console.log(`[Stage 4] Success - Cinematic raw video S3 Key: ${rawVideoS3Key}`);
    await stageDone(jobId, 4);

    // ── Stage 5: Cinematic Subtitles ─────────────────────────────────────────
    console.log(`[Stage 5] Starting cinematic subtitle burn-in for job ${jobId}`);
    console.log(`[Stage 5] Raw video S3 Key: ${rawVideoS3Key}`);
    await stageActive(jobId, 5, "Burning cinematic subtitles into video");
    
    const finalVideoS3Key = await addCinematicSubtitles(
      jobId,
      cinematicScript.scenes,
      timeline,
      rawVideoS3Key,
      tmpDir,
      {
        fontSize: 18,
        maxCharsPerLine: 42,
        maxLines: 2,
        fadeInDuration: 0.2,
        fadeOutDuration: 0.2,
      },
      (log) => publishProgress(jobId, { stage: 5, name: STAGE_NAMES[4], status: "active", log })
    );
    
    await prisma.video.update({
      where: { jobId },
      data: { s3VideoUrl: finalVideoS3Key },
    });
    console.log(`[Stage 5] Success - Final cinematic video S3 Key: ${finalVideoS3Key}`);
    await stageDone(jobId, 5);

    // ── CRITICAL: Upload final video to permanent storage ────────────────────
    console.log(`[Storage] Uploading final video to permanent storage`);
    const finalVideoPath = path.join(tmpDir, "final_video.mp4");
    const { videoS3Key: permanentS3Key, videoUrl, thumbnailUrl } = await uploadFinalVideoToStorage(
      jobId,
      finalVideoPath,
      tmpDir
    );
    
    // Update database with permanent storage URLs
    await prisma.video.update({
      where: { jobId },
      data: { 
        s3VideoUrl: permanentS3Key,
        thumbnailUrl: thumbnailUrl || null,
        renderStatus: "completed",
      },
    });
    
    console.log(`[Storage] ✓ Final video permanently stored: ${permanentS3Key}`);
    console.log(`[Storage] ✓ Video URL: ${videoUrl}`);

    // ── Stage 6: YouTube Upload ──────────────────────────────────────────────
    await stageActive(jobId, 6, "Uploading to YouTube");
    console.log(`[Stage 6] Final video uploaded to S3: ${permanentS3Key}`);
    console.log(`[Stage 6] Generated download URL available`);
    
    try {
      const { youtubeId, youtubeUrl } = await uploadToYouTube(
        jobId,
        userId,
        permanentS3Key,
        cinematicScript.title,
        cinematicScript.description,
        cinematicScript.tags,
        visibility,
        tmpDir,
        (log) => publishProgress(jobId, { stage: 6, name: STAGE_NAMES[5], status: "active", log })
      );
      await stageDone(jobId, 6);

      // ── Complete with YouTube upload ───────────────────────────────────────
      await prisma.video.update({
        where: { jobId },
        data: { 
          status: "completed",
          renderStatus: "completed",
          uploadStatus: "uploaded",
          youtubeId, 
          youtubeUrl,
        },
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
          renderStatus: "completed",
          uploadStatus: "failed",
          uploadError: `YouTube upload failed: ${uploadError}. Video is available for download.`,
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
      data: { 
        status: "failed",
        renderStatus: "failed",
        renderError: errorMessage,
      },
    });

    // Determine which stage failed
    const currentStage = await getCurrentStage(jobId);
    await stageError(jobId, currentStage, errorMessage);

    throw err; // Let BullMQ handle retries
  } finally {
    // Always clean up temp directory
    await cleanupTempFiles(tmpDir);
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
