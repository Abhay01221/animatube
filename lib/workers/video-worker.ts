/**
 * Video Rendering Worker (Jobs A-C)
 * 
 * Handles:
 * - Job A: Script generation, voiceover, visuals, assembly
 * - Job B: Cinematic subtitles
 * - Job C: Save final MP4 to local library
 * 
 * Does NOT handle YouTube upload (that's upload-worker.ts)
 */
import { Worker, Job } from "bullmq";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { VIDEO_QUEUE_NAME, type VideoJobData } from "../queue";
import { createRedisConnection } from "../redis";
import { prisma } from "../prisma";
import { generateCinematicScript } from "../stages/cinematic-script";
import { generateVoiceover, VOICE_MAP } from "../stages/voice";
import { fetchCinematicVisuals } from "../stages/cinematic-visuals";
import { assembleCinematicVideo } from "../stages/cinematic-assembly";
import { addCinematicSubtitles } from "../stages/cinematic-subtitles";
import { saveFinalVideoToLibrary } from "../local-storage";

// ─── Stage definitions ────────────────────────────────────────────────────────
export type StageStatus = "pending" | "active" | "done" | "error";

export interface StageUpdate {
  stage: number; // 1-5 (removed upload stage)
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
];

// ─── Redis for SSE progress storage ──────────────────────────────────────────
const progressRedis = createRedisConnection();

/** Publish a stage update to Redis (SSE clients poll/subscribe). */
async function publishProgress(
  jobId: string,
  update: StageUpdate
): Promise<void> {
  const key = `progress:${jobId}`;
  await progressRedis.rpush(key, JSON.stringify(update));
  await progressRedis.expire(key, 86400); // 24h TTL
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
  const { jobId, userId, prompt, style, duration, voice, language } = job.data;

  console.log(`\n========================================`);
  console.log(`[VideoWorker] Starting job ${jobId}`);
  console.log(`[VideoWorker] User: ${userId}`);
  console.log(`[VideoWorker] Prompt: ${prompt}`);
  console.log(`[VideoWorker] Style: ${style}, Duration: ${duration}, Voice: ${voice}`);
  console.log(`========================================\n`);

  // Create a temp directory for this job
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `animatube-${jobId}-`));
  console.log(`[VideoWorker] Temp directory: ${tmpDir}`);

  try {
    // Update DB status - render is now processing
    await prisma.video.update({
      where: { jobId },
      data: { 
        renderStatus: "processing",
        status: "processing", // Legacy field
      },
    });

    // ── Stage 1: Cinematic Script ────────────────────────────────────────────
    console.log(`[Stage 1] Starting cinematic script generation for job ${jobId}`);
    await stageActive(jobId, 1, `Planning cinematic ${duration} ${style} story`);
    
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
      data: { 
        s3VideoUrl: finalVideoS3Key,
        subtitlesAdded: true,
      },
    });
    console.log(`[Stage 5] Success - Final cinematic video S3 Key: ${finalVideoS3Key}`);
    await stageDone(jobId, 5);

    // ── Job C: Save to Local Library ─────────────────────────────────────────
    console.log(`[Job C] Saving final video to local library for job ${jobId}`);
    const localFilePath = await saveFinalVideoToLibrary(jobId, finalVideoS3Key);
    
    // ── Mark Render Complete ─────────────────────────────────────────────────
    await prisma.video.update({
      where: { jobId },
      data: { 
        renderStatus: "completed",
        status: "completed", // Legacy field
        localFilePath,
      },
    });

    // Publish completion event
    await publishProgress(jobId, {
      stage: 5,
      name: "render_complete",
      status: "done",
      log: "Video rendering complete! Video is ready for download.",
    });

    console.log(`[VideoWorker] Job ${jobId} completed successfully`);
    console.log(`[VideoWorker] Local file: ${localFilePath}`);
    console.log(`[VideoWorker] Video is ready for download and optional YouTube upload`);

  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[VideoWorker] Job ${jobId} failed:`, err);

    await prisma.video.update({
      where: { jobId },
      data: { 
        renderStatus: "failed",
        status: "failed", // Legacy field
        renderError: errorMessage,
      },
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
export function createVideoWorker() {
  const worker = new Worker<VideoJobData>(
    VIDEO_QUEUE_NAME,
    processVideoJob,
    {
      connection: createRedisConnection(),
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[VideoWorker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[VideoWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[VideoWorker] Worker error:", err);
  });

  return worker;
}
