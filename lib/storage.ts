/**
 * Persistent Video Storage Manager
 *
 * Uploads the final rendered .mp4 to Supabase Storage (bucket: "videos"),
 * stores the public URL in Prisma, then deletes the local temp file.
 *
 * Intermediate assets (voice, raw video, subtitles) continue to use S3.
 * Thumbnail generation is unchanged.
 */
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { supabaseAdmin } from "./supabase";
import { uploadFileToS3, getPresignedUrl } from "./s3";
import { prisma } from "./prisma";

const SUPABASE_BUCKET = "videos";

export interface FinalVideoAssets {
  videoS3Key: string;   // kept for backward-compat (set to Supabase path)
  videoUrl: string;     // permanent public URL from Supabase
  thumbnailS3Key?: string;
  thumbnailUrl?: string;
  subtitleS3Key?: string;
  subtitleUrl?: string;
}

/**
 * Upload final video to Supabase Storage and persist the public URL in Prisma.
 *
 * Called after subtitle burn-in completes (Stage 5).
 * The local .mp4 is deleted after a successful upload.
 *
 * @param jobId         - Job identifier
 * @param finalVideoPath - Absolute path to the rendered final_video.mp4
 * @param tmpDir        - Temp directory (used for thumbnail / subtitle lookup)
 * @returns Permanent Supabase URL and optional thumbnail/subtitle assets
 */
export async function uploadFinalVideoToStorage(
  jobId: string,
  finalVideoPath: string,
  tmpDir: string
): Promise<FinalVideoAssets> {
  console.log(`[Storage] Uploading final video for job ${jobId}`);
  console.log(`[Storage] Source: ${finalVideoPath}`);

  // ── 1. Verify the file exists ─────────────────────────────────────────────
  if (!fs.existsSync(finalVideoPath)) {
    const msg = `Final video not found: ${finalVideoPath}`;
    console.error(`[Storage] ${msg}`);
    await prisma.video.update({
      where: { jobId },
      data: { status: "failed", renderStatus: "failed", renderError: msg },
    });
    throw new Error(msg);
  }

  const stats = fs.statSync(finalVideoPath);
  console.log(`[Storage] File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // ── 2. Read the file into a Buffer ────────────────────────────────────────
  let fileBuffer: Buffer;
  try {
    fileBuffer = await fsp.readFile(finalVideoPath);
  } catch (err) {
    const msg = `Failed to read final video: ${(err as Error).message}`;
    console.error(`[Storage] ${msg}`);
    await prisma.video.update({
      where: { jobId },
      data: { status: "failed", renderStatus: "failed", renderError: msg },
    });
    throw new Error(msg);
  }

  // ── 3. Upload to Supabase Storage ─────────────────────────────────────────
  const bucketPath = `videos/${jobId}.mp4`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .upload(bucketPath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true, // overwrite if a retry re-runs the same jobId
    });

  if (uploadError) {
    const msg = `Supabase upload failed: ${uploadError.message}`;
    console.error(`[Storage] ${msg}`);
    await prisma.video.update({
      where: { jobId },
      data: { status: "failed", renderStatus: "failed", renderError: msg },
    });
    throw new Error(msg);
  }

  console.log(`[Storage] ✓ Video uploaded to Supabase: ${bucketPath}`);

  // ── 4. Get the public URL ─────────────────────────────────────────────────
  const { data: publicUrlData } = supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(bucketPath);

  const videoUrl = publicUrlData.publicUrl;
  console.log(`[Storage] ✓ Public URL: ${videoUrl}`);

  // ── 5. Delete local .mp4 after successful upload ──────────────────────────
  try {
    await fsp.unlink(finalVideoPath);
    console.log(`[Storage] ✓ Local file deleted: ${finalVideoPath}`);
  } catch (cleanupErr) {
    // Non-fatal — job is still completed
    console.warn(
      `[Storage] Warning: failed to delete local file ${finalVideoPath}:`,
      (cleanupErr as Error).message
    );
  }

  // ── 6. Optional: upload subtitle file to S3 (unchanged) ──────────────────
  let subtitleS3Key: string | undefined;
  let subtitleUrl: string | undefined;
  const subtitlePath = path.join(tmpDir, "cinematic_subs.ass");
  if (fs.existsSync(subtitlePath)) {
    try {
      subtitleS3Key = `videos/${jobId}/subtitles.ass`;
      await uploadFileToS3(subtitleS3Key, subtitlePath, "text/plain");
      subtitleUrl = await getPresignedUrl(subtitleS3Key, 604800);
      console.log(`[Storage] ✓ Subtitles uploaded: ${subtitleS3Key}`);
    } catch (err) {
      console.warn(`[Storage] Subtitle upload failed (non-fatal):`, err);
    }
  }

  // ── 7. Optional: generate and upload thumbnail (unchanged) ───────────────
  let thumbnailS3Key: string | undefined;
  let thumbnailUrl: string | undefined;
  // Note: finalVideoPath was deleted above; generate thumbnail from tmpDir copy
  // if it still exists (subtitle stage may have left a copy), otherwise skip.
  const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
  const thumbSourcePath = fs.existsSync(rawVideoPath) ? rawVideoPath : null;
  if (thumbSourcePath) {
    try {
      const thumbnailPath = await generateThumbnail(thumbSourcePath, tmpDir);
      if (thumbnailPath) {
        thumbnailS3Key = `videos/${jobId}/thumbnail.jpg`;
        await uploadFileToS3(thumbnailS3Key, thumbnailPath, "image/jpeg");
        thumbnailUrl = await getPresignedUrl(thumbnailS3Key, 604800);
        console.log(`[Storage] ✓ Thumbnail uploaded: ${thumbnailS3Key}`);
      }
    } catch (err) {
      console.warn(`[Storage] Thumbnail generation failed (non-fatal):`, err);
    }
  }

  // ── 8. Persist videoUrl + thumbnailUrl in Prisma ─────────────────────────
  await prisma.video.update({
    where: { jobId },
    data: {
      videoUrl,
      s3VideoUrl: bucketPath, // store Supabase path in s3VideoUrl for compat
      thumbnailUrl: thumbnailUrl ?? null,
    },
  });

  console.log(`[Storage] ✓ Database updated with Supabase URL`);

  return {
    videoS3Key: bucketPath,
    videoUrl,
    thumbnailS3Key,
    thumbnailUrl,
    subtitleS3Key,
    subtitleUrl,
  };
}

/**
 * Generate a thumbnail JPEG from a video file (first frame at 1 second).
 */
async function generateThumbnail(
  videoPath: string,
  tmpDir: string
): Promise<string | null> {
  const ffmpeg = (await import("./ffmpeg")).default;
  const thumbnailPath = path.join(tmpDir, "thumbnail.jpg");

  return new Promise((resolve) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ["1"],
        filename: "thumbnail.jpg",
        folder: tmpDir,
        size: "1920x1080",
      })
      .on("end", () => {
        resolve(fs.existsSync(thumbnailPath) ? thumbnailPath : null);
      })
      .on("error", (err: Error) => {
        console.warn(`[Storage] Thumbnail error: ${err.message}`);
        resolve(null);
      });
  });
}

/**
 * Clean up the entire temp directory after job completion.
 * Failure is non-fatal — logs a warning only.
 */
export async function cleanupTempFiles(tmpDir: string): Promise<void> {
  try {
    if (fs.existsSync(tmpDir)) {
      console.log(`[Storage] Cleaning up temp directory: ${tmpDir}`);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log(`[Storage] ✓ Temp files cleaned`);
    }
  } catch (err) {
    console.warn(`[Storage] Cleanup failed (non-fatal):`, err);
  }
}

/**
 * Get a download URL for a video.
 *
 * If the video has a Supabase public URL (videoUrl), return it directly.
 * Otherwise fall back to generating a presigned S3 URL from s3VideoUrl.
 */
export async function getVideoDownloadUrl(
  videoUrl: string | null,
  s3Key: string | null
): Promise<string> {
  if (videoUrl) {
    return videoUrl;
  }
  if (s3Key) {
    return getPresignedUrl(s3Key, 3600);
  }
  throw new Error("No video URL or S3 key available");
}
