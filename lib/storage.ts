/**
 * Persistent Video Storage Manager
 *
 * Upload strategy for final_video.mp4:
 *   1. Try Supabase Storage first (bucket: "videos")
 *   2. If Supabase rejects with a size-limit error (413 / "exceeded maximum allowed size" /
 *      "too large"), automatically fall back to AWS S3 with a public URL.
 *   3. Any other Supabase error is re-thrown immediately (no fallback).
 *   4. If S3 fallback also fails, re-throw — never mark a video complete without a valid URL.
 *
 * storageProvider field in DB:
 *   "supabase" — video lives in Supabase Storage, videoUrl is the public Supabase URL
 *   "s3"       — video lives in S3, videoUrl is the public S3 URL, s3Key holds the object key
 *   null       — legacy row, fall back to existing videoUrl behaviour
 *
 * Temp-file cleanup follows this strict sequence:
 *   1. Upload completes (Supabase or S3)
 *   2. DB write completes (storageProvider + videoUrl + s3Key all written)
 *   3. Only then: delete the local .mp4
 *   4. Log "[Cleanup] Removed local render artifacts for job <jobId>"
 *   On any failure: skip cleanup, log "[Cleanup] Skipped cleanup for job <jobId> — ..."
 */
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { supabaseAdmin } from "./supabase";
import { uploadFileToS3, uploadToS3, getPresignedUrl, s3Url } from "./s3";
import { prisma } from "./prisma";

const SUPABASE_BUCKET = "videos";

export interface FinalVideoAssets {
  videoS3Key: string;       // backward-compat: Supabase bucket path OR S3 key
  videoUrl: string;         // permanent public URL (Supabase or S3)
  storageProvider: "supabase" | "s3";
  thumbnailS3Key?: string;
  thumbnailUrl?: string;
  subtitleS3Key?: string;
  subtitleUrl?: string;
}

// ─── Size-limit error detection ───────────────────────────────────────────────

function isSupabaseSizeLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = (
    (err as any)?.message ??
    (err as any)?.error?.message ??
    String(err)
  ).toLowerCase();
  const status = (err as any)?.status ?? (err as any)?.statusCode ?? 0;
  return (
    status === 413 ||
    msg.includes("exceeded maximum allowed size") ||
    msg.includes("too large") ||
    msg.includes("payload too large") ||
    msg.includes("entity too large")
  );
}

// ─── Main upload function ─────────────────────────────────────────────────────

/**
 * Upload final video to persistent storage (Supabase first, S3 fallback).
 * Cleanup only runs after both upload AND DB write succeed.
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
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[Storage] File size: ${sizeMB} MB`);

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

  // ── 3. Try Supabase Storage ───────────────────────────────────────────────
  const bucketPath = `videos/${jobId}.mp4`;
  let storageProvider: "supabase" | "s3";
  let videoUrl: string;
  let finalS3Key: string | null = null;
  let fallbackTriggered = false;
  let fallbackReason = "";

  console.log(`[Storage] Provider: supabase (attempting)`);
  console.log(`[Storage] File size: ${sizeMB} MB`);

  const { error: supabaseError } = await supabaseAdmin.storage
    .from(SUPABASE_BUCKET)
    .upload(bucketPath, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (!supabaseError) {
    // ── Supabase success ──────────────────────────────────────────────────
    const { data: publicUrlData } = supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(bucketPath);

    storageProvider = "supabase";
    videoUrl = publicUrlData.publicUrl;

    // Verify the object actually exists before trusting the URL
    const { data: listData, error: listError } = await supabaseAdmin.storage
      .from(SUPABASE_BUCKET)
      .list(`videos`, { search: `${jobId}.mp4` });

    if (listError) {
      console.warn(`[Storage] Could not verify uploaded object (non-fatal): ${listError.message}`);
    } else {
      const found = listData?.some((f) => f.name === `${jobId}.mp4`);
      if (found) {
        console.log(`[Storage] Verified uploaded object exists in bucket`);
      } else {
        console.warn(`[Storage] Object not found in listing after upload — URL may still be valid`);
      }
    }

    console.log(`[Storage] Final video uploaded successfully`);
    console.log(`[Storage] Public URL generated successfully: ${videoUrl}`);
    console.log(`[Storage] Provider: supabase`);
    console.log(`[Storage] Fallback triggered: no`);
    console.log(`[Storage] Final URL: ${videoUrl}`);
    console.log(`[Storage] Uploaded to Supabase | size: ${sizeMB} MB | url: ${videoUrl}`);
  } else if (isSupabaseSizeLimitError(supabaseError)) {
    // ── Size-limit error → fall back to S3 ───────────────────────────────
    fallbackTriggered = true;
    fallbackReason = supabaseError.message;
    console.warn(`[Storage] Supabase rejected (size limit) | falling back to S3 | size: ${sizeMB} MB | reason: ${fallbackReason}`);
    console.log(`[Storage] Fallback triggered: yes`);
    console.log(`[Storage] Fallback reason: ${fallbackReason}`);

    const s3ObjectKey = `videos/${jobId}/final.mp4`;

    try {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const region = (process.env.AWS_REGION ?? "us-east-1").trim();
      const bucket = process.env.AWS_S3_BUCKET!.trim();
      const s3 = new S3Client({
        region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
        },
      });

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3ObjectKey,
          Body: fileBuffer,
          ContentType: "video/mp4",
          CacheControl: "public, max-age=31536000",
          // ACL not set here — bucket policy must allow public read
        })
      );

      const publicS3Url = s3Url(s3ObjectKey);
      storageProvider = "s3";
      videoUrl = publicS3Url;
      finalS3Key = s3ObjectKey;

      console.log(`[Storage] Provider: s3`);
      console.log(`[Storage] Fallback triggered: yes`);
      console.log(`[Storage] Fallback reason: ${fallbackReason}`);
      console.log(`[Storage] Final URL: ${videoUrl}`);
      console.log(`[Storage] Supabase rejected (size limit) | falling back to S3 | size: ${sizeMB} MB | s3Key: ${s3ObjectKey} | url: ${videoUrl}`);
    } catch (s3Err) {
      const s3ErrMsg = (s3Err as Error).message;
      console.error(`[Storage] S3 fallback also failed | reason: ${s3ErrMsg}`);
      console.log(`[Cleanup] Skipped cleanup for job ${jobId} — upload or DB update failed`);
      // Do NOT mark video complete, do NOT clean up temp files
      throw s3Err;
    }
  } else {
    // ── Other Supabase error — re-throw, no fallback ──────────────────────
    const msg = `Supabase upload failed: ${supabaseError.message}`;
    console.error(`[Storage] ${msg}`);
    console.log(`[Cleanup] Skipped cleanup for job ${jobId} — upload or DB update failed`);
    await prisma.video.update({
      where: { jobId },
      data: { status: "failed", renderStatus: "failed", renderError: msg },
    });
    throw new Error(msg);
  }

  // ── 4. DB write (must complete before cleanup) ────────────────────────────
  let dbWriteSucceeded = false;
  try {
    await prisma.video.update({
      where: { jobId },
      data: {
        videoUrl,
        storageProvider,
        s3Key: finalS3Key ?? null,
        // Keep s3VideoUrl for backward-compat (stores bucket path or S3 key)
        s3VideoUrl: storageProvider === "supabase" ? bucketPath : (finalS3Key ?? null),
      },
    });
    dbWriteSucceeded = true;
    console.log(`[DB] Video metadata persisted successfully | provider: ${storageProvider} | url: ${videoUrl}`);
  } catch (dbErr) {
    // DB write failed — attempt one retry before giving up
    console.error(`[Storage] DB update failed (attempt 1): ${(dbErr as Error).message}`);
    console.warn(`[Storage] Retrying DB write...`);
    try {
      await new Promise((r) => setTimeout(r, 1000)); // 1s back-off
      await prisma.video.update({
        where: { jobId },
        data: {
          videoUrl,
          storageProvider,
          s3Key: finalS3Key ?? null,
          s3VideoUrl: storageProvider === "supabase" ? bucketPath : (finalS3Key ?? null),
        },
      });
      dbWriteSucceeded = true;
      console.log(`[DB] Video metadata persisted successfully (retry) | provider: ${storageProvider}`);
    } catch (retryErr) {
      console.error(`[Storage] DB update failed (attempt 2): ${(retryErr as Error).message}`);
      console.log(`[Cleanup] Skipped cleanup for job ${jobId} — upload or DB update failed`);
      // Upload succeeded but DB failed — do NOT mark as failed (MP4 exists in storage)
      // Rethrow so the worker can handle it
      throw retryErr;
    }
  }

  // ── 5. Cleanup — only after upload AND DB write both succeeded ────────────
  try {
    await fsp.unlink(finalVideoPath);
    console.log(`[Cleanup] Removed local render artifacts for job ${jobId}`);
  } catch (cleanupErr) {
    // Non-fatal — job is still complete
    console.warn(`[Storage] Warning: failed to delete local file ${finalVideoPath}: ${(cleanupErr as Error).message}`);
  }

  // ── 6. Optional: upload subtitle file to S3 ───────────────────────────────
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

  // ── 7. Optional: generate and upload thumbnail ────────────────────────────
  let thumbnailS3Key: string | undefined;
  let thumbnailUrl: string | undefined;
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

  // ── 8. Persist thumbnail in Prisma (videoUrl already written above) ───────
  if (thumbnailUrl) {
    await prisma.video.update({
      where: { jobId },
      data: { thumbnailUrl },
    });
  }

  return {
    videoS3Key: storageProvider === "supabase" ? bucketPath : (finalS3Key ?? bucketPath),
    videoUrl,
    storageProvider,
    thumbnailS3Key,
    thumbnailUrl,
    subtitleS3Key,
    subtitleUrl,
  };
}

// ─── Thumbnail helper ─────────────────────────────────────────────────────────

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

// ─── Temp directory cleanup ───────────────────────────────────────────────────

/**
 * Clean up the entire temp directory after job completion.
 * Called from worker.ts in the `finally` block — failure is non-fatal.
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

// ─── Download URL helper ──────────────────────────────────────────────────────

/**
 * Get a URL for video download or streaming.
 *
 * storageProvider drives the logic:
 *   "supabase" → Supabase signed URL (download mode) or public URL (stream mode)
 *   "s3"       → public S3 URL (no expiry needed — bucket is public)
 *   null       → legacy: use videoUrl or s3Key as before
 *
 * mode "stream"   → URL for browser playback (no Content-Disposition)
 * mode "download" → URL that forces browser save-to-disk
 */
export async function getVideoDownloadUrl(
  videoUrl: string | null,
  s3Key: string | null,
  mode: "stream" | "download" = "stream",
  rawTitle?: string | null,
  storageProvider?: string | null
): Promise<string> {
  // ── safeTitle (download mode only) ───────────────────────────────────────
  const safeTitle = (() => {
    const base = (rawTitle ?? "video")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/ /g, "_")
      .substring(0, 120);
    return (base || "video") + ".mp4";
  })();

  console.log(`[Storage/download] storageProvider=${storageProvider ?? "null"}`);
  console.log(`[Storage/download] videoUrl=${videoUrl ?? "null"}`);
  console.log(`[Storage/download] s3Key=${s3Key ?? "null"}`);
  console.log(`[Storage/download] mode=${mode}`);

  // ── S3-backed video (new storageProvider="s3") ────────────────────────────
  if (storageProvider === "s3") {
    if (!videoUrl) throw new Error("storageProvider is s3 but videoUrl is null");
    // videoUrl is the permanent public S3 URL — no signing needed
    console.log(`[Storage/download] Provider: s3 | returning public URL`);
    console.log(`[Storage/download] Final URL: ${videoUrl}`);
    return videoUrl;
  }

  // ── Supabase-backed video (storageProvider="supabase" or legacy with videoUrl) ──
  if (storageProvider === "supabase" || (storageProvider == null && videoUrl)) {
    if (!videoUrl) throw new Error("storageProvider is supabase but videoUrl is null");

    console.log(`[Storage/download] Provider: supabase`);
    console.log(`[Storage/download] NEXT_PUBLIC_SUPABASE_URL set: ${!!process.env.NEXT_PUBLIC_SUPABASE_URL}`);
    console.log(`[Storage/download] SUPABASE_SERVICE_ROLE_KEY set: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);

    if (mode === "stream") {
      console.log(`[Storage/download] Final URL: ${videoUrl}`);
      return videoUrl;
    }

    // Download mode: create a Supabase signed URL with Content-Disposition
    // Resolve the bucket path: prefer s3Key (raw path) over parsing the public URL
    let storagePath: string | null = null;
    if (s3Key && !s3Key.startsWith("http")) {
      storagePath = s3Key;
      console.log(`[Storage/download] Using s3Key as Supabase bucket path: ${storagePath}`);
    } else {
      const marker = "/object/public/videos/";
      const idx = videoUrl.indexOf(marker);
      if (idx !== -1) {
        storagePath = videoUrl.slice(idx + marker.length);
        console.log(`[Storage/download] Parsed Supabase path from videoUrl: ${storagePath}`);
      }
    }

    if (!storagePath) {
      console.warn("[Storage/download] Could not determine Supabase storage path, falling back to public URL");
      return videoUrl;
    }

    try {
      const { data, error } = await supabaseAdmin.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(storagePath, 300, { download: safeTitle });

      if (error || !data?.signedUrl) {
        console.error(`[Storage/download] Supabase signed URL failed: ${error?.message ?? "no URL returned"}`);
        console.warn(`[Storage/download] Falling back to public URL`);
        return videoUrl;
      }

      console.log(`[Storage/download] ✓ Supabase signed URL generated`);
      console.log(`[Storage/download] Final URL: (signed)`);
      return data.signedUrl;
    } catch (err) {
      console.error(`[Storage/download] Supabase signed URL threw:`, err);
      console.warn(`[Storage/download] Falling back to public URL`);
      return videoUrl;
    }
  }

  // ── Legacy S3-backed video (storageProvider=null, no videoUrl, s3Key set) ──
  if (s3Key) {
    console.log(`[Storage/download] Legacy S3 path. Bucket: ${process.env.AWS_S3_BUCKET}, Region: ${process.env.AWS_REGION}, Key: ${s3Key}`);
    console.log(`[Storage/download] AWS_ACCESS_KEY_ID set: ${!!process.env.AWS_ACCESS_KEY_ID}`);
    console.log(`[Storage/download] AWS_SECRET_ACCESS_KEY set: ${!!process.env.AWS_SECRET_ACCESS_KEY}`);

    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");

    const region = (process.env.AWS_REGION ?? "us-east-1").trim();
    const bucket = process.env.AWS_S3_BUCKET?.trim();
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        `Missing AWS credentials for S3 download. Bucket: ${bucket ? "set" : "MISSING"}, ` +
        `AccessKeyId: ${accessKeyId ? "set" : "MISSING"}, SecretKey: ${secretAccessKey ? "set" : "MISSING"}`
      );
    }

    const s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });

    try {
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          ResponseContentDisposition: `attachment; filename="${safeTitle}"`,
        }),
        { expiresIn: 300 }
      );
      console.log(`[Storage/download] ✓ Legacy S3 signed URL generated for key: ${s3Key}`);
      console.log(`[Storage/download] Final URL: (signed)`);
      return signedUrl;
    } catch (err) {
      console.error(`[Storage/download] S3 getSignedUrl failed. Bucket: ${bucket}, Region: ${region}, Key: ${s3Key}`, err);
      throw err;
    }
  }

  throw new Error("Video URL not available");
}
