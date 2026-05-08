/**
 * Stage 5 — Subtitle Generation & Burn-in
 * Generates an SRT file from script segments + timing data,
 * then burns subtitles into the video with FFmpeg.
 */
import * as fs from "fs";
import * as path from "path";
import ffmpeg from "../ffmpeg";
import { downloadFromS3, uploadFileToS3 } from "../s3";
import type { ScriptSegment } from "./script";
import type { TimelineEntry } from "./visuals";

export async function addSubtitles(
  jobId: string,
  segments: ScriptSegment[],
  timeline: TimelineEntry[],
  rawVideoS3Key: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<string> {
  onLog?.("Generating SRT subtitle file");

  // Build SRT from timeline timing
  const srtContent = buildSRT(segments, timeline);
  const srtPath = path.join(tmpDir, "subs.srt");
  fs.writeFileSync(srtPath, srtContent, "utf8");

  // Upload SRT to S3
  await uploadFileToS3(`jobs/${jobId}/subs.srt`, srtPath, "text/plain");

  // Download raw video
  const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
  onLog?.("Downloading raw video for subtitle burn-in");
  const rawBuffer = await downloadFromS3(rawVideoS3Key);
  fs.writeFileSync(rawVideoPath, rawBuffer);

  // Burn subtitles
  const finalVideoPath = path.join(tmpDir, "final_video.mp4");
  onLog?.("Burning subtitles into video");
  await burnSubtitles(rawVideoPath, srtPath, finalVideoPath);

  // Upload final video
  const s3Key = `jobs/${jobId}/final_video.mp4`;
  await uploadFileToS3(s3Key, finalVideoPath, "video/mp4");
  onLog?.(`Final video uploaded to S3: ${s3Key}`);

  return s3Key;
}

/** Build an SRT file from segments and their timeline entries. */
function buildSRT(
  segments: ScriptSegment[],
  timeline: TimelineEntry[]
): string {
  const blocks: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const entry = timeline[i];
    if (!entry) continue;

    const startTime = formatSRTTime(entry.start_sec);
    const endTime = formatSRTTime(entry.end_sec);
    const text = segments[i].segment;

    blocks.push(`${i + 1}\n${startTime} --> ${endTime}\n${text}`);
  }

  return blocks.join("\n\n") + "\n";
}

/** Format seconds as SRT timestamp: HH:MM:SS,mmm */
function formatSRTTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":") + `,${String(ms).padStart(3, "0")}`;
}

/** Burn subtitles into video using FFmpeg subtitles filter. */
function burnSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath: string
): Promise<void> {
  // Escape path for FFmpeg filter (Windows backslashes need special handling)
  const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .videoFilters(
        // YouTube-style white text with black outline, bottom-center
        `subtitles='${escapedSrt}':force_style='FontName=Arial,FontSize=22,PrimaryColour=&Hffffff,OutlineColour=&H000000,Bold=1,Outline=2,Shadow=1,Alignment=2,MarginV=30'`
      )
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "copy",
        "-pix_fmt", "yuv420p",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
