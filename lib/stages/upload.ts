/**
 * Stage 6 — YouTube Upload
 * Downloads final_video.mp4 from S3, uploads to YouTube,
 * generates a canvas-based thumbnail (free, no API), and stores the YouTube URL in DB.
 */
import * as fs from "fs";
import * as path from "path";
import { createCanvas } from "canvas";
import { downloadFromS3, uploadToS3 } from "../s3";
import { uploadVideoToYouTube, uploadThumbnail } from "../youtube";
import { prisma } from "../prisma";

export async function uploadToYouTube(
  jobId: string,
  userId: string,
  finalVideoS3Key: string,
  title: string,
  description: string,
  tags: string[],
  privacyStatus: string,
  tmpDir: string,
  onLog?: (msg: string) => void
): Promise<{ youtubeId: string; youtubeUrl: string }> {
  console.log(`[Stage 6] Starting YouTube upload for job ${jobId}`);
  console.log(`[Stage 6] User ID: ${userId}`);
  console.log(`[Stage 6] S3 Key: ${finalVideoS3Key}`);
  
  onLog?.(`Downloading final video from S3: ${finalVideoS3Key}`);

  // Download final video to temp file
  const videoBuffer = await downloadFromS3(finalVideoS3Key);
  const videoPath = path.join(tmpDir, "final_video.mp4");
  fs.writeFileSync(videoPath, videoBuffer);
  const videoSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
  onLog?.(`Video downloaded (${videoSizeMB} MB)`);
  console.log(`[Stage 6] Video downloaded: ${videoPath} (${videoSizeMB} MB)`);

  // Create a readable stream for upload
  const { Readable } = await import("stream");
  const videoStream = Readable.from(videoBuffer);

  onLog?.(`Uploading to YouTube as "${title}" (${privacyStatus})`);
  console.log(`[Stage 6] Uploading to YouTube...`);
  console.log(`[Stage 6] Title: ${title}`);
  console.log(`[Stage 6] Privacy: ${privacyStatus}`);
  console.log(`[Stage 6] Tags: ${tags.join(", ")}`);
  
  try {
    const youtubeId = await uploadVideoToYouTube(userId, {
      title,
      description,
      tags,
      privacyStatus,
      videoStream,
      fileSize: videoBuffer.length,
    });

    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    onLog?.(`YouTube upload complete: ${youtubeUrl}`);
    console.log(`[Stage 6] Success! YouTube ID: ${youtubeId}`);
    console.log(`[Stage 6] YouTube URL: ${youtubeUrl}`);

    // Generate and upload canvas thumbnail (free, no API key)
    try {
      onLog?.("Generating thumbnail with canvas");
      console.log(`[Stage 6] Generating thumbnail...`);
      const thumbnailBuffer = generateCanvasThumbnail(title);
      // Upload to S3 for reference
      await uploadToS3(`jobs/${jobId}/thumbnail.png`, thumbnailBuffer, "image/png");
      // Upload to YouTube
      await uploadThumbnail(userId, youtubeId, thumbnailBuffer);
      onLog?.("Thumbnail uploaded");
      console.log(`[Stage 6] Thumbnail uploaded successfully`);
    } catch (err) {
      // Thumbnail failure is non-fatal
      const errMsg = (err as Error).message;
      onLog?.(`⚠ Thumbnail upload failed: ${errMsg}`);
      console.error(`[Stage 6] Thumbnail error:`, err);
    }

    // Update DB
    await prisma.video.update({
      where: { jobId },
      data: { youtubeId, youtubeUrl },
    });

    return { youtubeId, youtubeUrl };
  } catch (err) {
    console.error("[Stage 6] YouTube Upload Error:", err);
    if ((err as any).response?.data) {
      console.error("[Stage 6] YouTube API Response:", (err as any).response.data);
    }
    throw err;
  }
}

/**
 * Generate a 1280x720 thumbnail using node-canvas.
 * Dark background, centered white title text, purple accent bar at the bottom.
 */
function generateCanvasThumbnail(title: string): Buffer {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const ACCENT_HEIGHT = 8;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── Subtle gradient overlay for depth ───────────────────────────────────────
  const gradient = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT / 2, 0,
    WIDTH / 2, HEIGHT / 2, WIDTH * 0.7
  );
  gradient.addColorStop(0, "rgba(124, 58, 237, 0.12)"); // violet center glow
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ── Title text ───────────────────────────────────────────────────────────────
  // Wrap long titles across multiple lines
  const lines = wrapText(ctx, title.toUpperCase(), WIDTH - 120);
  const fontSize = lines.length > 2 ? 56 : 68;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const startY = (HEIGHT - ACCENT_HEIGHT) / 2 - totalTextHeight / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, WIDTH / 2, startY + i * lineHeight);
  });

  // ── Purple accent bar at the bottom ─────────────────────────────────────────
  ctx.fillStyle = "#7c3aed";
  ctx.fillRect(0, HEIGHT - ACCENT_HEIGHT, WIDTH, ACCENT_HEIGHT);

  return canvas.toBuffer("image/png");
}

/**
 * Word-wrap text to fit within maxWidth, returning an array of lines.
 * Uses the canvas context's measureText for accurate pixel widths.
 */
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

  // Cap at 3 lines to avoid overflow
  return lines.slice(0, 3);
}
