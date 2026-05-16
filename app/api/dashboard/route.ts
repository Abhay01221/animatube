/**
 * GET /api/dashboard
 * Returns the authenticated user's video history with granular status.
 *
 * URL resolution per video:
 *   storageProvider="supabase" → videoUrl is the permanent public Supabase URL
 *   storageProvider="s3"       → videoUrl is the permanent public S3 URL
 *   null (legacy)              → fall back to s3VideoUrl presigned URL
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getPresignedUrl } from "@/lib/s3";

export async function GET(req: NextRequest) {
  // Verify Firebase token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split("Bearer ")[1];

  let decoded;
  try {
    decoded = await verifyIdToken(token);
  } catch (error) {
    console.error("[dashboard] Token verification failed:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find user by Firebase UID
  const currentUser = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (!currentUser) {
    return NextResponse.json(
      { error: "User not found. Please sign in again." },
      { status: 401 }
    );
  }

  const videos = await prisma.video.findMany({
    where: { userId: currentUser.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      jobId: true,
      status: true,
      renderStatus: true,
      uploadStatus: true,
      subtitlesAdded: true,
      prompt: true,
      style: true,
      duration: true,
      title: true,
      youtubeId: true,
      youtubeUrl: true,
      // Storage fields
      videoUrl: true,         // permanent public URL (Supabase or S3)
      storageProvider: true,  // "supabase" | "s3" | null
      s3Key: true,            // S3 object key (only when storageProvider="s3")
      s3VideoUrl: true,       // legacy: Supabase bucket path or old S3 key
      thumbnailUrl: true,
      renderError: true,
      uploadError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Resolve playback and download URLs per video
  const enhancedVideos = await Promise.all(
    videos.map(async (video) => {
      let resolvedVideoUrl: string | null = null;
      const downloadUrl = `/api/download/${video.id}`;

      const isComplete =
        video.renderStatus === "completed" ||
        video.status === "completed";

      if (isComplete) {
        if (video.videoUrl) {
          // New storage system: videoUrl is always the permanent public URL
          resolvedVideoUrl = video.videoUrl;
          console.log(`[dashboard] Video ${video.jobId} | provider: ${video.storageProvider ?? "legacy"} | url: ${resolvedVideoUrl}`);
        } else if (video.s3VideoUrl) {
          // Legacy: s3VideoUrl is an S3 key — generate a presigned URL
          try {
            resolvedVideoUrl = await getPresignedUrl(video.s3VideoUrl, 604800);
            console.log(`[dashboard] Video ${video.jobId} | legacy S3 presigned URL generated`);
          } catch (err) {
            console.error(`[dashboard] Failed to generate presigned URL for ${video.jobId}:`, err);
          }
        }
      }

      return {
        id: video.id,
        jobId: video.jobId,
        status: video.status,
        renderStatus: video.renderStatus,
        uploadStatus: video.uploadStatus,
        subtitlesAdded: video.subtitlesAdded,
        prompt: video.prompt,
        style: video.style,
        duration: video.duration,
        title: video.title,
        youtubeId: video.youtubeId,
        youtubeUrl: video.youtubeUrl,
        storageProvider: video.storageProvider,
        s3VideoUrl: video.s3VideoUrl,
        videoUrl: resolvedVideoUrl,   // resolved playback URL
        downloadUrl,                  // always set — API handles auth + URL generation
        thumbnailUrl: video.thumbnailUrl,
        renderError: video.renderError,
        uploadError: video.uploadError,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
      };
    })
  );

  // Stats — use both status and renderStatus to handle legacy + new rows
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = enhancedVideos.filter((v) => new Date(v.createdAt) >= weekAgo).length;
  const completed = enhancedVideos.filter(
    (v) => v.renderStatus === "completed" || v.status === "completed"
  ).length;
  const failed = enhancedVideos.filter(
    (v) => v.renderStatus === "failed" || v.status === "failed"
  ).length;
  const uploaded = enhancedVideos.filter((v) => v.uploadStatus === "uploaded").length;

  return NextResponse.json({
    videos: enhancedVideos,
    stats: {
      total: enhancedVideos.length,
      thisWeek,
      completed,
      failed,
      uploaded,
      renderCompleted: completed,
      renderFailed: failed,
      uploadFailed: enhancedVideos.filter((v) => v.uploadStatus === "failed").length,
    },
  });
}
