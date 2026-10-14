/**
 * Stage 3 — Visual Fetching
 * For each script segment: search Pexels for a video clip.
 * Fallback: generate a simple placeholder image using canvas (free, no API key).
 * Builds a timeline.json describing each visual asset.
 */
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { createCanvas } from "canvas";
import { uploadToS3, uploadFileToS3 } from "../s3";
import type { ScriptSegment } from "./script";

export interface TimelineEntry {
  type: "clip" | "image";
  localPath: string; // temp path during assembly
  s3Key: string;
  start_sec: number;
  end_sec: number;
  visual_cue: string;
}

export async function fetchVisuals(
  jobId: string,
  segments: ScriptSegment[],
  audioDuration: number,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<TimelineEntry[]> {
  const timeline: TimelineEntry[] = [];
  let cursor = 0;

  // Distribute audio duration proportionally across segments
  const totalScriptDuration = segments.reduce(
    (sum, s) => sum + s.duration_seconds,
    0
  );
  const scale = audioDuration / totalScriptDuration;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segDuration = seg.duration_seconds * scale;
    const startSec = cursor;
    const endSec = cursor + segDuration;
    cursor = endSec;

    onLog?.(`Fetching visuals for: ${seg.visual_cue}`);

    const result = await fetchClipOrImage(
      jobId,
      i,
      seg.visual_cue,
      tmpDir,
      onLog
    );

    timeline.push({
      ...result,
      start_sec: startSec,
      end_sec: endSec,
      visual_cue: seg.visual_cue,
    });
  }

  // Save timeline to S3
  await uploadToS3(
    `jobs/${jobId}/timeline.json`,
    JSON.stringify(timeline, null, 2),
    "application/json"
  );

  return timeline;
}

/** Try Pexels first; fall back to a canvas-generated placeholder image. */
async function fetchClipOrImage(
  jobId: string,
  index: number,
  query: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<Omit<TimelineEntry, "start_sec" | "end_sec" | "visual_cue">> {
  const pexelsKey = process.env.PEXELS_API_KEY?.trim();

  if (pexelsKey) {
    try {
      const clip = await fetchPexelsClip(query, pexelsKey);
      if (clip) {
        const localPath = path.join(tmpDir, `clip_${index}.mp4`);
        await downloadFile(clip.url, localPath);
        const s3Key = `jobs/${jobId}/clips/clip_${index}.mp4`;
        await uploadFileToS3(s3Key, localPath, "video/mp4");
        onLog?.(`  ✓ Pexels clip downloaded for segment ${index}`);
        return { type: "clip", localPath, s3Key };
      }
    } catch (err) {
      onLog?.(`  ⚠ Pexels failed for segment ${index}: ${(err as Error).message}`);
    }
  }

  // Fallback: canvas placeholder image (free, no API key)
  onLog?.(`  → Generating placeholder image for segment ${index}`);
  const imageBuffer = generatePlaceholderImage(query, index);
  const localPath = path.join(tmpDir, `image_${index}.png`);
  fs.writeFileSync(localPath, imageBuffer);
  const s3Key = `jobs/${jobId}/clips/image_${index}.png`;
  await uploadFileToS3(s3Key, localPath, "image/png");
  onLog?.(`  ✓ Placeholder image created for segment ${index}`);
  return { type: "image", localPath, s3Key };
}

/**
 * Generate a 1920x1080 placeholder image using canvas.
 * Dark background with a subtle gradient, the visual cue text centered,
 * and a colored accent that cycles through a palette per segment index.
 */
function generatePlaceholderImage(visualCue: string, index: number): Buffer {
  const WIDTH = 1920;
  const HEIGHT = 1080;

  // Cycle through a set of accent colors for visual variety
  const ACCENTS = [
    "#7c3aed", // violet
    "#2563eb", // blue
    "#059669", // emerald
    "#d97706", // amber
    "#dc2626", // red
    "#7c3aed", // violet (repeat)
  ];
  const accent = ACCENTS[index % ACCENTS.length];

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Radial gradient with accent color
  const grad = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT / 2, 0,
    WIDTH / 2, HEIGHT / 2, WIDTH * 0.6
  );
  grad.addColorStop(0, `${accent}22`); // very subtle center glow
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Accent bar at top
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, 6);

  // Visual cue text — wrap and center
  ctx.font = "bold 52px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, visualCue, WIDTH - 160);
  const lineHeight = 70;
  const totalH = lines.length * lineHeight;
  const startY = HEIGHT / 2 - totalH / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, startY + i * lineHeight);
  });

  // Segment number watermark (bottom-right, subtle)
  ctx.font = "24px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${index + 1}`, WIDTH - 40, HEIGHT - 30);

  return canvas.toBuffer("image/png");
}

/** Word-wrap text to fit within maxWidth. */
function wrapText(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

/** Search Pexels Videos API and return the best HD clip URL. */
async function fetchPexelsClip(
  query: string,
  apiKey: string
): Promise<{ url: string } | null> {
  const response = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: apiKey },
    params: { query, per_page: 3, size: "medium" },
  });

  const videos = response.data.videos as PexelsVideo[];
  if (!videos || videos.length === 0) return null;

  for (const video of videos) {
    const hdFile = video.video_files.find(
      (f) => f.quality === "hd" || f.quality === "sd"
    );
    if (hdFile) return { url: hdFile.link };
  }
  return null;
}

/** Download a URL to a local file path. */
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(dest, Buffer.from(response.data));
}

// ─── Pexels types ─────────────────────────────────────────────────────────────
interface PexelsVideoFile {
  link: string;
  quality: string;
  width: number;
  height: number;
}
interface PexelsVideo {
  id: number;
  video_files: PexelsVideoFile[];
}
