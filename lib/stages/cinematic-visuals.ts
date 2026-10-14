/** Reviewed stock, uploaded assets, diagrams, and explicit placeholders. */
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { createCanvas } from "canvas";
import { z } from "zod";
import { uploadToS3, uploadFileToS3 } from "../s3";
import { downloadAsset } from "../assets";
import { generateScenePrompt } from "../cinematic/prompt-enhancer";
import { resolveRenderOptions, resolveSceneDurations } from "../cinematic/render-options";
import type { CinematicScene, CharacterDescription, RenderOptions } from "../types/cinematic";

export interface CinematicTimelineEntry {
  type: "clip" | "image"; localPath: string; s3Key: string; start_sec: number; end_sec: number; scene: CinematicScene;
  inputHash?: string; contentHash?: string; placeholder?: boolean; source?: "stock" | "upload" | "diagram" | "generated" | "placeholder";
  sourceUrl?: string; stockId?: number;
}
/** A separately configured adapter must disclose provider cost before the caller selects it. */
export interface GeneratedVisualProvider {
  id: string;
  generate(input: { prompt: string; sceneIndex: number; duration: number; width: number; height: number; targetPath: string; signal?: AbortSignal }): Promise<{ type: "clip" | "image"; localPath: string }>;
}
export interface VisualOptions extends RenderOptions {
  sceneDurations?: number[];
  cachedAssets?: CinematicTimelineEntry[];
  onSceneComplete?: (checkpoint: CinematicTimelineEntry) => Promise<void>;
  generatedProvider?: GeneratedVisualProvider;
}

export async function fetchCinematicVisuals(jobId: string, scenes: CinematicScene[], characters: CharacterDescription[] | undefined,
  audioDuration: number, tmpDir: string, onLog?: (msg: string) => void, options: VisualOptions = {}): Promise<CinematicTimelineEntry[]> {
  const durations = resolveSceneDurations(scenes.map((scene) => scene.duration_seconds), audioDuration, options.sceneDurations);
  const timeline: CinematicTimelineEntry[] = [];
  const usedStockIds = new Set<number>();
  const usedHashes = new Set<string>();
  let cursor = 0;
  for (const [index, scene] of scenes.entries()) {
    options.signal?.throwIfAborted();
    const duration = durations[index];
    const start_sec = cursor;
    cursor += duration;
    const inputHash = createHash("sha256").update(JSON.stringify({ version: 3, visual: scene.visual_prompt, environment: scene.environment,
      characters, visualStyle: options.visualStyle, output: resolveRenderOptions(options), asset: scene.visual_asset, diagram: scene.diagram,
      provider: options.generatedProvider?.id })).digest("hex");
    const cached = options.cachedAssets?.find((entry) => entry.inputHash === inputHash && entry.scene.scene_id === scene.scene_id);
    let result: Omit<CinematicTimelineEntry, "start_sec" | "end_sec" | "scene"> | undefined;
    if (cached) {
      const localPath = path.join(tmpDir, `visual_${index}.${cached.type === "clip" ? "mp4" : "png"}`);
      try {
        await downloadAsset({ provider: "s3", key: cached.s3Key }, localPath);
        const contentHash = await hashFile(localPath);
        if (cached.contentHash && contentHash !== cached.contentHash) throw new Error("Saved visual content changed");
        result = { ...cached, localPath };
        if (cached.stockId) usedStockIds.add(cached.stockId);
        usedHashes.add(contentHash);
        onLog?.(`Reusing saved visual for scene ${index + 1}`);
      } catch { onLog?.(`Saved visual for scene ${index + 1} is missing or corrupt; fetching it again`); }
    }
    if (!result) result = await createSceneVisual(jobId, index, scene, characters, duration, tmpDir, usedStockIds, usedHashes, options, onLog);
    const entry = { ...result, start_sec, end_sec: cursor, scene, inputHash };
    timeline.push(entry);
    await options.onSceneComplete?.(entry);
  }
  await uploadToS3(`jobs/${jobId}/cinematic-timeline.json`, JSON.stringify(timeline, null, 2), "application/json");
  return timeline;
}

async function createSceneVisual(jobId: string, index: number, scene: CinematicScene, characters: CharacterDescription[] | undefined,
  duration: number, tmpDir: string, usedIds: Set<number>, usedHashes: Set<string>, options: VisualOptions, onLog?: (msg: string) => void): Promise<Omit<CinematicTimelineEntry, "start_sec" | "end_sec" | "scene">> {
  const { width, height } = resolveRenderOptions(options);
  let type: "clip" | "image" = "image";
  let localPath = path.join(tmpDir, `image_${index}.png`);
  let source: CinematicTimelineEntry["source"] = "placeholder";
  let stockId: number | undefined;
  let sourceUrl: string | undefined;
  if (scene.visual_asset) {
    type = scene.visual_asset.type;
    localPath = path.join(tmpDir, `upload_${index}.${type === "clip" ? "mp4" : "png"}`);
    await downloadAsset({ provider: scene.visual_asset.provider ?? "s3", key: scene.visual_asset.s3Key }, localPath);
    source = "upload";
  } else if (scene.diagram) {
    fs.writeFileSync(localPath, generateDiagram(scene.diagram, width, height));
    source = "diagram";
  } else if (options.generatedProvider) {
    const prompt = generateScenePrompt(scene.visual_prompt, scene.emotion, scene.environment, scene.camera_direction,
      scene.lighting ?? "bright", scene.shot_type, characters, options.visualStyle);
    onLog?.(`Generating scene ${index + 1} with configured provider ${options.generatedProvider.id}`);
    const generated = await options.generatedProvider.generate({ prompt, sceneIndex: index, duration, width, height, targetPath: localPath, signal: options.signal });
    type = generated.type; localPath = generated.localPath; source = "generated";
  } else {
    const key = process.env.PEXELS_API_KEY?.trim();
    if (key) {
      try {
        const candidates = await fetchPexelsCandidates(scene.visual_prompt, key, width, height, duration, options.signal);
        for (const clip of candidates) {
          if (usedIds.has(clip.id)) continue;
          const clipPath = path.join(tmpDir, `clip_${index}.mp4`);
          try {
            await downloadStockFile(clip.link, clipPath, options.signal);
            const hash = await hashFile(clipPath);
            if (usedHashes.has(hash)) continue;
            type = "clip"; localPath = clipPath; source = "stock"; stockId = clip.id; sourceUrl = clip.sourceUrl;
            usedIds.add(clip.id); usedHashes.add(hash); break;
          } catch (error) {
            if (options.signal?.aborted) throw error;
            onLog?.(`Stock candidate unavailable for scene ${index + 1}; trying another candidate`);
          }
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
        onLog?.(`Stock search unavailable for scene ${index + 1}; visual needs review`);
      }
    }
    if (source === "placeholder") {
      fs.writeFileSync(localPath, generatePlaceholder(scene.visual_prompt, index, width, height));
      onLog?.(`Scene ${index + 1} uses a placeholder. Replace or approve it in the storyboard.`);
    }
  }
  const contentHash = await hashFile(localPath);
  const s3Key = `jobs/${jobId}/clips/${index}-${contentHash.slice(0, 20)}.${type === "clip" ? "mp4" : "png"}`;
  await uploadFileToS3(s3Key, localPath, type === "clip" ? "video/mp4" : "image/png");
  return { type, localPath, s3Key, contentHash, placeholder: source === "placeholder", source, stockId, sourceUrl };
}

export function conciseStockQuery(prompt: string): string {
  const stop = new Set(["a", "an", "the", "of", "and", "with", "in", "on", "to", "for", "show", "showing", "scene", "cinematic", "camera", "shot", "beautiful", "dramatic", "slow", "zoom", "dolly", "high", "quality", "realistic", "detailed", "style"]);
  return [...new Set(prompt.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((word) => word.length > 2 && !stop.has(word)))].slice(0, 7).join(" ") || "abstract background";
}
const pexelsSchema = z.object({ videos: z.array(z.object({ id: z.number(), url: z.string().optional(), duration: z.number().optional(),
  video_files: z.array(z.object({ link: z.string().url(), width: z.number(), height: z.number(), file_type: z.string().optional() })),
})) });
async function fetchPexelsCandidates(prompt: string, key: string, width: number, height: number, duration: number, signal?: AbortSignal) {
  const query = conciseStockQuery(prompt);
  const response = await axios.get("https://api.pexels.com/videos/search", { headers: { Authorization: key },
    params: { query, per_page: 12, orientation: width < height ? "portrait" : "landscape", size: "medium" }, timeout: 15_000, signal, maxContentLength: 2 * 1024 * 1024 });
  const videos = pexelsSchema.parse(response.data).videos;
  return videos.flatMap((video) => video.video_files.filter((file) => (!file.file_type || file.file_type === "video/mp4") && file.width > 0 && file.height > 0)
    .map((file) => ({ id: video.id, link: file.link, sourceUrl: video.url,
      score: Math.abs(file.width / file.height - width / height) * 5 + Math.abs(Math.log(file.height / height)) + (video.duration && video.duration < duration ? 0.5 : 0),
    }))).sort((a, b) => a.score - b.score).slice(0, 12);
}

async function downloadStockFile(url: string, dest: string, signal?: AbortSignal): Promise<void> {
  const host = new URL(url);
  if (host.protocol !== "https:" || !["pexels.com", "pexelscdn.com"].some((domain) => host.hostname === domain || host.hostname.endsWith(`.${domain}`))) throw new Error("Unexpected stock media host");
  const maxBytes = 100 * 1024 * 1024;
  const response = await axios.get(url, { responseType: "stream", timeout: 45_000, signal, maxRedirects: 0 });
  if (Number(response.headers["content-length"] ?? 0) > maxBytes) { response.data.destroy(); throw new Error("Stock media exceeds 100 MB"); }
  let size = 0;
  const cap = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    size += chunk.length; callback(size > maxBytes ? new Error("Stock media exceeds 100 MB") : null, chunk);
  } });
  try { await pipeline(response.data, cap, fs.createWriteStream(dest), { signal }); }
  catch (error) { fs.rmSync(dest, { force: true }); throw error; }
}
async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function generatePlaceholder(text: string, index: number, width: number, height: number): Buffer {
  const canvas = createCanvas(width, height); const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#101827"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#93c5fd"; ctx.font = `${Math.round(width / 25)}px sans-serif`; ctx.textAlign = "center";
  ctx.fillText(`Scene ${index + 1} · Visual needs review`, width / 2, height * 0.25);
  ctx.fillStyle = "white"; ctx.font = `bold ${Math.round(width / 20)}px sans-serif`;
  const words = text.split(/\s+/); let line = ""; const lines: string[] = [];
  for (const word of words) {
    if (ctx.measureText(`${line} ${word}`).width > width * 0.8 && line) { lines.push(line); line = word; } else line += `${line ? " " : ""}${word}`;
  }
  if (line) lines.push(line);
  lines.slice(0, 6).forEach((item, i) => ctx.fillText(item, width / 2, height * 0.4 + i * width / 14));
  return canvas.toBuffer("image/png");
}
function generateDiagram(diagram: { title: string; items: string[] }, width: number, height: number): Buffer {
  const canvas = createCanvas(width, height); const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, width, height); ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a"; ctx.font = `bold ${Math.round(width / 24)}px sans-serif`; ctx.fillText(diagram.title, width / 2, height * 0.12, width * 0.9);
  const count = diagram.items.length; const gap = height * 0.72 / Math.max(count, 1);
  diagram.items.forEach((item, index) => {
    const y = height * 0.2 + index * gap;
    ctx.fillStyle = "#dbeafe"; ctx.fillRect(width * 0.12, y, width * 0.76, gap * 0.7);
    ctx.fillStyle = "#1e3a8a"; ctx.font = `${Math.round(width / 32)}px sans-serif`; ctx.fillText(item, width / 2, y + gap * 0.43, width * 0.7);
  });
  return canvas.toBuffer("image/png");
}
