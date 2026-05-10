/**
 * Stage 4 (Enhanced) — Cinematic Video Assembly
 * Enhanced assembly with motion effects, transitions, and cinematic processing.
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

export async function assembleCinematicVideo(
  jobId: string,
  timeline: CinematicTimelineEntry[],
  voiceS3Key: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<string> {
  onLog?.(`🎬 Assembling ${timeline.length} cinematic scenes into video`);

  // Download voice track
  const voicePath = path.join(tmpDir, "voice.mp3");
  const voiceBuffer = await downloadFromS3(voiceS3Key);
  fs.writeFileSync(voicePath, voiceBuffer);

  // Process each visual with cinematic motion effects
  const processedPaths: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const scene = entry.scene;
    const duration = entry.end_sec - entry.start_sec;
    const outPath = path.join(tmpDir, `cinematic_${i}.mp4`);

    onLog?.(
      `  🎥 Processing scene ${i + 1}/${timeline.length} (${duration.toFixed(1)}s, ${scene.emotion})`
    );

    console.log(`[Assembly] Scene ${i + 1}: ${entry.type}, duration: ${duration}s`);
    console.log(`[Assembly] Input: ${entry.localPath}`);
    console.log(`[Assembly] Output: ${outPath}`);

    try {
      if (entry.type === "clip") {
        // Apply cinematic effects to video clip
        // Vignette disabled to avoid FFmpeg compatibility issues
        await applyMotionEffectsToClip(
          entry.localPath,
          outPath,
          duration,
          scene.camera_direction,
          [] // No additional effects for maximum compatibility
        );
      } else {
        // Apply motion effects to image
        // Vignette disabled to avoid FFmpeg compatibility issues
        await applyMotionEffectsToImage(
          entry.localPath,
          outPath,
          duration,
          scene.camera_direction,
          [] // No additional effects for maximum compatibility
        );
      }

      // Verify output file exists and has content
      if (!fs.existsSync(outPath)) {
        throw new Error(`Processed file not created: ${outPath}`);
      }

      const stats = fs.statSync(outPath);
      if (stats.size === 0) {
        throw new Error(`Processed file is empty: ${outPath}`);
      }

      console.log(`[Assembly] Scene ${i + 1} processed successfully: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      processedPaths.push(outPath);
    } catch (err) {
      console.error(`[Assembly] Failed to process scene ${i + 1}:`, err);
      throw new Error(`Scene ${i + 1} processing failed: ${(err as Error).message}`);
    }
  }

  // Write concat list file
  const concatListPath = path.join(tmpDir, "concat.txt");
  const concatContent = processedPaths
    .map((p) => `file '${p.replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  console.log(`[Assembly] Concat list created with ${processedPaths.length} files`);
  console.log(`[Assembly] Concat list content:\n${concatContent}`);

  // Concatenate all processed clips
  const concatenatedPath = path.join(tmpDir, "concatenated.mp4");
  onLog?.("🔗 Concatenating scenes...");
  await concatClipsWithTransitions(concatListPath, concatenatedPath, timeline);

  // Verify concatenated file
  if (!fs.existsSync(concatenatedPath)) {
    throw new Error("Concatenated video not created");
  }

  const concatStats = fs.statSync(concatenatedPath);
  console.log(`[Assembly] Concatenated video size: ${(concatStats.size / 1024 / 1024).toFixed(2)} MB`);

  // Mix in voiceover with cinematic audio processing
  const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
  onLog?.("🎵 Mixing voiceover with cinematic audio...");
  await mixCinematicAudio(concatenatedPath, voicePath, rawVideoPath);

  // Verify final file
  if (!fs.existsSync(rawVideoPath)) {
    throw new Error("Raw video not created after audio mixing");
  }

  const rawStats = fs.statSync(rawVideoPath);
  console.log(`[Assembly] Raw video size: ${(rawStats.size / 1024 / 1024).toFixed(2)} MB`);

  // Upload to S3
  const s3Key = `jobs/${jobId}/raw_video.mp4`;
  await uploadFileToS3(s3Key, rawVideoPath, "video/mp4");
  onLog?.(`✓ Cinematic raw video uploaded to S3: ${s3Key}`);

  return s3Key;
}

/**
 * Concatenate clips with optional transition effects
 */
function concatClipsWithTransitions(
  concatListPath: string,
  outputPath: string,
  timeline: CinematicTimelineEntry[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Assembly] Starting concatenation from: ${concatListPath}`);

    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions([
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30", // Force 30 fps
        "-s",
        "1920x1080", // Force output size
        "-aspect",
        "16:9", // Force aspect ratio
        "-an",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Assembly] Concat FFmpeg command: ${cmd}`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[Assembly] Concat progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on("end", () => {
        console.log(`[Assembly] Concatenation complete: ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Assembly] Concat error: ${err.message}`);
        console.error(`[Assembly] FFmpeg stderr:\n${stderr}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Mix video with audio track with cinematic audio processing
 */
function mixCinematicAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Assembly] Starting audio mix: video=${videoPath}, audio=${audioPath}`);

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v",
        "copy", // Copy video stream (already encoded)
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-af",
        "acompressor=threshold=-20dB:ratio=4:attack=5:release=50,loudnorm",
        "-shortest", // Trim to shortest stream
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Assembly] Audio mix FFmpeg command: ${cmd}`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`[Assembly] Audio mix progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on("end", () => {
        console.log(`[Assembly] Audio mix complete: ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Assembly] Audio mix error: ${err.message}`);
        console.error(`[Assembly] FFmpeg stderr:\n${stderr}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Apply transition effect between two clips (advanced feature - not currently used)
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
        // Cut (no transition)
        filterComplex = `[0:v][1:v]concat=n=2:v=1:a=0[v]`;
    }

    ffmpeg()
      .input(clip1Path)
      .input(clip2Path)
      .complexFilter(filterComplex)
      .outputOptions(["-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "20"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
