/**
 * Stage 3 (Enhanced) — Cinematic Visual Fetching
 * Enhanced version that uses cinematic prompts and applies motion effects.
 */
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { createCanvas } from "canvas";
import { uploadToS3, uploadFileToS3 } from "../s3";
import { generateScenePrompt } from "../cinematic/prompt-enhancer";
import type { CinematicScene, CharacterDescription } from "../types/cinematic";

export interface CinematicTimelineEntry {
  type: "clip" | "image";
  localPath: string;
  s3Key: string;
  start_sec: number;
  end_sec: number;
  scene: CinematicScene;
}

export async function fetchCinematicVisuals(
  jobId: string,
  scenes: CinematicScene[],
  characters: CharacterDescription[] | undefined,
  audioDuration: number,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<CinematicTimelineEntry[]> {
  const timeline: CinematicTimelineEntry[] = [];
  let cursor = 0;

  // Distribute audio duration proportionally across scenes
  const totalScriptDuration = scenes.reduce((sum, s) => sum + s.duration_seconds, 0);
  const scale = audioDuration / totalScriptDuration;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const segDuration = scene.duration_seconds * scale;
    const startSec = cursor;
    const endSec = cursor + segDuration;
    cursor = endSec;

    onLog?.(
      `🎨 Scene ${scene.scene_id}: Fetching visuals for "${scene.visual_prompt.substring(0, 40)}..."`
    );

    // Generate enhanced cinematic prompt
    const enhancedPrompt = generateScenePrompt(
      scene.visual_prompt,
      scene.emotion,
      scene.environment,
      scene.camera_direction,
      "dramatic", // Default lighting, can be customized
      scene.shot_type,
      characters
    );

    onLog?.(`  Enhanced prompt: "${enhancedPrompt.substring(0, 60)}..."`);

    const result = await fetchClipOrImage(
      jobId,
      i,
      enhancedPrompt,
      scene.visual_prompt, // Use original for Pexels search
      tmpDir,
      onLog
    );

    timeline.push({
      ...result,
      start_sec: startSec,
      end_sec: endSec,
      scene,
    });
  }

  // Save timeline to S3
  await uploadToS3(
    `jobs/${jobId}/cinematic-timeline.json`,
    JSON.stringify(timeline, null, 2),
    "application/json"
  );

  return timeline;
}

/** Try Pexels first; fall back to cinematic placeholder image. */
async function fetchClipOrImage(
  jobId: string,
  index: number,
  enhancedPrompt: string,
  searchQuery: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<Omit<CinematicTimelineEntry, "start_sec" | "end_sec" | "scene">> {
  const pexelsKey = process.env.PEXELS_API_KEY;

  if (pexelsKey) {
    try {
      const clip = await fetchPexelsClip(searchQuery, pexelsKey);
      if (clip) {
        const localPath = path.join(tmpDir, `clip_${index}.mp4`);
        await downloadFile(clip.url, localPath);
        const s3Key = `jobs/${jobId}/clips/clip_${index}.mp4`;
        await uploadFileToS3(s3Key, localPath, "video/mp4");
        onLog?.(`  ✓ Pexels clip downloaded`);
        return { type: "clip", localPath, s3Key };
      }
    } catch (err) {
      onLog?.(`  ⚠ Pexels failed: ${(err as Error).message}`);
    }
  }

  // Fallback: cinematic placeholder image
  onLog?.(`  → Generating cinematic placeholder image`);
  const imageBuffer = generateCinematicPlaceholder(enhancedPrompt, index);
  const localPath = path.join(tmpDir, `image_${index}.png`);
  fs.writeFileSync(localPath, imageBuffer);
  const s3Key = `jobs/${jobId}/clips/image_${index}.png`;
  await uploadFileToS3(s3Key, localPath, "image/png");
  onLog?.(`  ✓ Cinematic placeholder created`);
  return { type: "image", localPath, s3Key };
}

/**
 * Generate a cinematic 1920x1080 placeholder with anime aesthetic
 */
function generateCinematicPlaceholder(promptText: string, index: number): Buffer {
  const WIDTH = 1920;
  const HEIGHT = 1080;

  // Cinematic color palettes
  const PALETTES = [
    { bg: "#0a0a14", accent: "#7c3aed", glow: "#a78bfa" }, // Violet
    { bg: "#0f0a1a", accent: "#2563eb", glow: "#60a5fa" }, // Blue
    { bg: "#0a1410", accent: "#059669", glow: "#34d399" }, // Emerald
    { bg: "#1a0f0a", accent: "#d97706", glow: "#fbbf24" }, // Amber
    { bg: "#1a0a0a", accent: "#dc2626", glow: "#f87171" }, // Red
  ];

  const palette = PALETTES[index % PALETTES.length];

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Dark cinematic background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Radial gradient for depth
  const grad = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    0,
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.7
  );
  grad.addColorStop(0, `${palette.accent}33`);
  grad.addColorStop(0.5, `${palette.accent}11`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Vignette effect
  const vignette = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.3,
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.8
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Cinematic bars (letterbox)
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  ctx.fillRect(0, 0, WIDTH, 80);
  ctx.fillRect(0, HEIGHT - 80, WIDTH, 80);

  // Accent line
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, WIDTH, 4);
  ctx.fillRect(0, HEIGHT - 4, WIDTH, 4);

  // Extract key words from prompt (first 3-4 words)
  const words = promptText.split(" ").slice(0, 4).join(" ");
  const displayText = words.length > 50 ? words.substring(0, 47) + "..." : words;

  // Main text with glow effect
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Glow effect
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = 30;
  ctx.fillStyle = palette.glow;
  ctx.fillText(displayText, WIDTH / 2, HEIGHT / 2);

  // Main text
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(displayText, WIDTH / 2, HEIGHT / 2);

  // Scene number (subtle)
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`Scene ${index + 1}`, WIDTH - 40, HEIGHT - 40);

  // Anime-style accent elements
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 200, HEIGHT / 2 + 80);
  ctx.lineTo(WIDTH / 2 + 200, HEIGHT / 2 + 80);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

/** Search Pexels Videos API */
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
    const hdFile = video.video_files.find((f) => f.quality === "hd" || f.quality === "sd");
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
