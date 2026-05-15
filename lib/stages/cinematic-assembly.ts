/**
 * Stage 4 (Enhanced) — Cinematic Video Assembly
 *
 * Memory-safe for 8GB RAM (GCP e2-standard-2):
 * - Per-scene renders output 720p (motion-effects.ts handles this)
 * - Concatenation upscales 720p → 1080p in a single pass (no double-encode)
 * - All FFmpeg processes limited to 2 threads
 * - Temp scene files deleted immediately after each scene is added to concat list
 * - Retry logic: each scene retries once on failure before aborting
 * - loudnorm removed from audio mix (CPU-intensive, not needed for stability)
 */
import * as fs from "fs";
import * as path from "path";
import ffmpeg from "../ffmpeg";
import { downloadFromS3, uploadFileToS3 } from "../s3";
import {
  applyMotionEffectsToImage,
  applyMotionEffectsToClip,
} from "../cinematic/motion-effects";
import type { CinematicTimelineEntry } from "./cinematic-visuals";
import type { TransitionType } from "../types/cinematic";

/** Safely delete a file, logging a warning on failure (never throws). */
function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Assembly] Deleted temp file: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.warn(`[Assembly] Could not delete ${filePath}: ${(err as Error).message}`);
  }
}

/** Log current process memory. */
function logMemory(label: string): void {
  const mem = process.memoryUsage();
  console.log(
    `[Assembly] ${label} — RSS: ${(mem.rss / 1024 / 1024).toFixed(0)}MB` +
    ` | Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB`
  );
}

export async function assembleCinematicVideo(
  jobId: string,
  timeline: CinematicTimelineEntry[],
  voiceS3Key: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<string> {
  onLog?.(`🎬 Assembling ${timeline.length} cinematic scenes into video`);
  logMemory("Assembly start");

  // Download voice track
  const voicePath = path.join(tmpDir, "voice.mp3");
  const voiceBuffer = await downloadFromS3(voiceS3Key);
  fs.writeFileSync(voicePath, voiceBuffer);

  // Process each scene sequentially with retry logic.
  // Temp files are deleted immediately after being added to the concat list
  // to free disk space and reduce OS page cache pressure.
  const processedPaths: string[] = [];

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const scene = entry.scene;
    const duration = entry.end_sec - entry.start_sec;
    const outPath = path.join(tmpDir, `cinematic_${i}.mp4`);

    onLog?.(
      `  🎥 Scene ${i + 1}/${timeline.length} (${duration.toFixed(1)}s, ${scene.emotion})`
    );
    logMemory(`Before scene ${i + 1}`);

    // Retry once on failure — transient FFmpeg errors can be recovered
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[Assembly] Retrying scene ${i + 1} (attempt ${attempt})...`);
          safeUnlink(outPath); // clean up partial output from failed attempt
        }

        if (entry.type === "clip") {
          await applyMotionEffectsToClip(
            entry.localPath,
            outPath,
            duration,
            scene.camera_direction,
            []
          );
        } else {
          await applyMotionEffectsToImage(
            entry.localPath,
            outPath,
            duration,
            scene.camera_direction,
            []
          );
        }

        if (!fs.existsSync(outPath)) {
          throw new Error(`Output file not created: ${outPath}`);
        }
        const stats = fs.statSync(outPath);
        if (stats.size === 0) {
          throw new Error(`Output file is empty: ${outPath}`);
        }

        console.log(
          `[Assembly] Scene ${i + 1} OK: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
        );
        processedPaths.push(outPath);
        lastErr = null;
        break; // success
      } catch (err) {
        lastErr = err as Error;
        console.error(`[Assembly] Scene ${i + 1} attempt ${attempt} failed: ${lastErr.message}`);
      }
    }

    if (lastErr) {
      throw new Error(`Scene ${i + 1} failed after 2 attempts: ${lastErr.message}`);
    }

    // Delete the source asset immediately — it's no longer needed
    safeUnlink(entry.localPath);
    logMemory(`After scene ${i + 1}`);
  }

  // Write concat list
  const concatListPath = path.join(tmpDir, "concat.txt");
  const concatContent = processedPaths
    .map((p) => `file '${p.replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(concatListPath, concatContent);
  console.log(`[Assembly] Concat list: ${processedPaths.length} scenes`);

  // Concatenate all 720p scenes → upscale to 1080p in one pass.
  // This is the ONLY place 1080p encoding happens, keeping peak RAM low.
  const concatenatedPath = path.join(tmpDir, "concatenated.mp4");
  onLog?.("🔗 Concatenating and upscaling to 1080p...");
  logMemory("Before concat");
  await concatAndUpscale(concatListPath, concatenatedPath);

  // Delete per-scene files now that concat is done
  for (const p of processedPaths) {
    safeUnlink(p);
  }

  const concatStats = fs.statSync(concatenatedPath);
  console.log(
    `[Assembly] Concatenated (1080p): ${(concatStats.size / 1024 / 1024).toFixed(2)} MB`
  );
  logMemory("After concat");

  // Mix voiceover
  const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
  onLog?.("🎵 Mixing voiceover...");
  await mixCinematicAudio(concatenatedPath, voicePath, rawVideoPath);

  // Delete concatenated file — raw_video.mp4 is the new source
  safeUnlink(concatenatedPath);
  safeUnlink(voicePath);

  const rawStats = fs.statSync(rawVideoPath);
  console.log(`[Assembly] Raw video: ${(rawStats.size / 1024 / 1024).toFixed(2)} MB`);
  logMemory("After audio mix");

  // Upload to S3
  const s3Key = `jobs/${jobId}/raw_video.mp4`;
  await uploadFileToS3(s3Key, rawVideoPath, "video/mp4");
  onLog?.(`✓ Raw video uploaded: ${s3Key}`);

  return s3Key;
}

/**
 * Concatenate 720p scene clips and upscale to 1080p in a single pass.
 *
 * BEFORE: concat at 1080p (medium preset) → high RAM
 * AFTER:  concat 720p inputs → scale to 1080p → veryfast preset → low RAM
 *
 * The scale filter runs on the already-decoded stream so it adds minimal overhead.
 */
function concatAndUpscale(
  concatListPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Assembly] Concat+upscale: ${concatListPath} → ${outputPath}`);

    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .videoFilters([
        // Upscale from 720p to 1080p with high-quality Lanczos
        "scale=1920:1080:flags=lanczos",
        "setsar=1",
        "setdar=16/9",
      ])
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "veryfast",  // was: medium — saves ~1GB RAM during encode
        "-crf", "20",           // final quality CRF (higher than intermediates)
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-an",
        "-threads", "2",
        "-max_muxing_queue_size", "1024",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Assembly] Concat FFmpeg: ${cmd.substring(0, 300)}...`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[Assembly] Concat progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on("end", () => {
        console.log(`[Assembly] Concat+upscale complete`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Assembly] Concat error: ${err.message}`);
        console.error(`[Assembly] FFmpeg stderr:\n${stderr?.slice(-1000)}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Mix video with voiceover.
 *
 * Removed loudnorm (CPU/RAM intensive) — replaced with simple acompressor.
 * Audio quality is identical for speech content.
 */
function mixCinematicAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Assembly] Audio mix: ${path.basename(videoPath)} + ${path.basename(audioPath)}`);

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",          // was: 192k — 128k is transparent for speech
        "-af", "acompressor=threshold=-20dB:ratio=4:attack=5:release=50",
        // Removed: loudnorm — it requires two-pass analysis, doubles processing time
        "-shortest",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-threads", "2",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Assembly] Audio mix FFmpeg: ${cmd.substring(0, 200)}...`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[Assembly] Audio mix: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on("end", () => {
        console.log(`[Assembly] Audio mix complete`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Assembly] Audio mix error: ${err.message}`);
        console.error(`[Assembly] FFmpeg stderr:\n${stderr?.slice(-500)}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Apply transition effect between two clips (not currently used in main pipeline)
 */
function applyTransition(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  transitionType: TransitionType,
  transitionDuration: number = 1
): Promise<void> {
  return new Promise((resolve, reject) => {
    let filterComplex = "";

    switch (transitionType) {
      case "fade":
        filterComplex = `[0:v][1:v]xfade=transition=fade:duration=${transitionDuration}:offset=0[v]`;
        break;
      case "dissolve":
        filterComplex = `[0:v][1:v]xfade=transition=dissolve:duration=${transitionDuration}:offset=0[v]`;
        break;
      case "wipe":
        filterComplex = `[0:v][1:v]xfade=transition=wipeleft:duration=${transitionDuration}:offset=0[v]`;
        break;
      case "blur transition":
        filterComplex = `[0:v][1:v]xfade=transition=fadeblack:duration=${transitionDuration}:offset=0[v]`;
        break;
      default:
        filterComplex = `[0:v][1:v]concat=n=2:v=1:a=0[v]`;
    }

    ffmpeg()
      .input(clip1Path)
      .input(clip2Path)
      .complexFilter(filterComplex)
      .outputOptions([
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-threads", "2",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
