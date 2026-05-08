/**
 * Stage 4 — Video Assembly
 * Trims/scales each visual to its segment duration, concatenates all clips,
 * mixes in the voiceover, and outputs raw_video.mp4.
 */
import * as fs from "fs";
import * as path from "path";
import ffmpeg from "../ffmpeg";
import { downloadFromS3, uploadFileToS3 } from "../s3";
import type { TimelineEntry } from "./visuals";

export async function assembleVideo(
  jobId: string,
  timeline: TimelineEntry[],
  voiceS3Key: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<string> {
  onLog?.(`Assembling ${timeline.length} clips into raw video`);

  // Download voice track
  const voicePath = path.join(tmpDir, "voice.mp3");
  const voiceBuffer = await downloadFromS3(voiceS3Key);
  fs.writeFileSync(voicePath, voiceBuffer);

  // Process each visual: trim to duration, scale to 1920x1080
  const processedPaths: string[] = [];
  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const duration = entry.end_sec - entry.start_sec;
    const outPath = path.join(tmpDir, `processed_${i}.mp4`);

    onLog?.(`  Processing segment ${i + 1}/${timeline.length} (${duration.toFixed(1)}s)`);

    if (entry.type === "clip") {
      await processClip(entry.localPath, outPath, duration);
    } else {
      await imageToClip(entry.localPath, outPath, duration);
    }
    processedPaths.push(outPath);
  }

  // Write concat list file
  const concatListPath = path.join(tmpDir, "concat.txt");
  const concatContent = processedPaths
    .map((p) => `file '${p.replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  // Concatenate all processed clips
  const concatenatedPath = path.join(tmpDir, "concatenated.mp4");
  onLog?.("Concatenating all clips...");
  await concatClips(concatListPath, concatenatedPath);

  // Mix in voiceover
  const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
  onLog?.("Mixing voiceover into video...");
  await mixAudio(concatenatedPath, voicePath, rawVideoPath);

  // Upload to S3
  const s3Key = `jobs/${jobId}/raw_video.mp4`;
  await uploadFileToS3(s3Key, rawVideoPath, "video/mp4");
  onLog?.(`Raw video uploaded to S3: ${s3Key}`);

  return s3Key;
}

/** Trim a video clip to `duration` seconds and scale to 1920x1080. */
function processClip(
  inputPath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-t", String(duration)])
      .videoFilters([
        // Scale to 1920x1080, letterbox with black bars if needed
        "scale=1920:1080:force_original_aspect_ratio=decrease",
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
        "setsar=1",
      ])
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-an", // strip original audio
        "-t", String(duration),
        "-r", "30",
        "-pix_fmt", "yuv420p",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

/** Convert a still image to a video clip of `duration` seconds. */
function imageToClip(
  imagePath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .inputOptions(["-loop", "1", "-framerate", "30"])
      .videoFilters([
        "scale=1920:1080:force_original_aspect_ratio=decrease",
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
        "setsar=1",
        // Subtle Ken Burns zoom effect for still images
        `zoompan=z='min(zoom+0.0005,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(duration * 30)}:s=1920x1080:fps=30`,
      ])
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-t", String(duration),
        "-pix_fmt", "yuv420p",
        "-an",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

/** Concatenate clips using the concat demuxer (no re-encode). */
function concatClips(
  concatListPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-an",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}

/** Mix video with audio track; trim to shortest. */
function mixAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest", // trim to the shorter of video/audio
        "-map", "0:v:0",
        "-map", "1:a:0",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
