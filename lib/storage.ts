/** Durable private storage; callers retain local files until checkpoints are committed. */
import { existsSync } from "node:fs";
import { rm, stat } from "node:fs/promises";
import * as path from "node:path";
import { prisma } from "./prisma";
import { supabaseAdmin } from "./supabase";
import { assetFromVideo, getAssetUrl, uploadAssetFile, verifyAsset, type AssetRef, ASSET_BUCKET } from "./assets";

export interface FinalVideoAssets {
  videoS3Key: string;
  videoUrl: string;
  storageProvider: "supabase" | "s3";
  thumbnailS3Key?: string;
  thumbnailUrl?: string;
  subtitleS3Key?: string;
  subtitleUrl?: string;
}
export function sizeLimitError(error: unknown): boolean {
  const details = error as { message?: string; status?: number|string; statusCode?: number|string }|null;
  return Number(details?.status) === 413 || Number(details?.statusCode) === 413 || /too large|exceeded (?:the )?maximum allowed size|payload too large/i.test(details?.message || "");
}
async function requirePrivateSupabaseBucket(): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.getBucket(ASSET_BUCKET);
  if (error) throw error;
  if (data.public) throw new Error('The Supabase "videos" bucket must be private before storing user media. Disable public access in Storage settings.');
}
export async function uploadFinalVideoToStorage(jobId: string, finalVideoPath: string, tmpDir: string, execution?: {token:string;queueVersion:number}): Promise<FinalVideoAssets> {
  const info = await stat(finalVideoPath);
  if (!info.isFile() || !info.size) throw new Error("Final video is missing or empty");
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prefix=`videos/${jobId}/${execution?`${execution.queueVersion}-${execution.token}`:"legacy"}`;
  let asset: AssetRef = { provider: hasSupabase ? "supabase" : "s3", key: `${prefix}/final.mp4` };
  try {
    if (asset.provider === "supabase") await requirePrivateSupabaseBucket();
    await uploadAssetFile(asset, finalVideoPath, "video/mp4");
  } catch (error) {
    if (asset.provider !== "supabase" || !sizeLimitError(error)) throw error;
    asset = { provider: "s3", key: `${prefix}/final.mp4` };
    await uploadAssetFile(asset, finalVideoPath, "video/mp4");
  }
  if (!(await verifyAsset(asset))) throw new Error("Storage could not verify the uploaded video");
  const videoUrl = await getAssetUrl(asset);
  const saved=await prisma.video.updateMany({ where: { jobId,...(execution?{executionToken:execution.token,queueVersion:execution.queueVersion}:{}) }, data: {
    storageProvider: asset.provider, s3Key: asset.key, s3VideoUrl: asset.key, videoUrl,
  } });
  if(!saved.count)throw new Error("A newer generation owns this video's storage pointer");
  const result: FinalVideoAssets = { storageProvider: asset.provider, videoS3Key: asset.key, videoUrl };
  // Accessories are optional. Their failure cannot undo a completed render.
  const subtitlePath = path.join(tmpDir, "cinematic_subs.ass");
  if (existsSync(subtitlePath)) {
    try {
      const subtitle: AssetRef = { provider: asset.provider, key: `${prefix}/subtitles.ass` };
      await uploadAssetFile(subtitle, subtitlePath, "text/plain; charset=utf-8");
      result.subtitleS3Key = subtitle.key;
      result.subtitleUrl = await getAssetUrl(subtitle);
    } catch { console.warn(`[Storage] Subtitle accessory unavailable for ${jobId}`); }
  }
  // Do not unlink here: the worker commits the storage checkpoint before cleanup.
  return result;
}
export async function cleanupTempFiles(tmpDir: string): Promise<void> {
  const resolved = path.resolve(tmpDir);
  const allowedRoots = [path.resolve(process.cwd(), "tmp"), path.resolve(process.env.TEMP || process.env.TMP || "/tmp")];
  if (!allowedRoots.some(root => resolved !== root && resolved.startsWith(root + path.sep))) {
    throw new Error("Refusing cleanup outside a temporary job directory");
  }
  await rm(resolved, { recursive: true, force: true });
}
export async function getVideoDownloadUrl(videoUrl: string | null, s3Key: string | null,
  mode: "stream" | "download" = "stream", rawTitle?: string | null, storageProvider?: string | null): Promise<string> {
  const asset = assetFromVideo({ videoUrl, s3Key, storageProvider });
  if (!asset) throw new Error("Video storage reference unavailable. Regenerate or migrate this legacy video.");
  const title = Array.from(rawTitle || "video").filter(char => char.charCodeAt(0) >= 32).join("")
    .replace(/[<>:"/\\|?*]/g, "_").trim().slice(0, 120) || "video";
  return getAssetUrl(asset, 300, mode === "download" ? `${title}.mp4` : undefined);
}
