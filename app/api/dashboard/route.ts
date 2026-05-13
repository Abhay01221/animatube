/**
 * GET /api/dashboard
 * Returns the authenticated user's video history with granular status.
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
      status: true, // Legacy field
      renderStatus: true,
      uploadStatus: true,
      subtitlesAdded: true,
      prompt: true,
      style: true,
      duration: true,
      title: true,
      youtubeId: true,
      youtubeUrl: true,
      s3VideoUrl: true,
      thumbnailUrl: true,
      renderError: true,
      uploadError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Enhance with presigned URLs for video playback and download
  const enhancedVideos = await Promise.all(
    videos.map(async (video: typeof videos[number]) => {
      let videoUrl: string | null = null;
      let downloadUrl: string | null = null;

      // Generate presigned URLs for completed videos
      if (video.renderStatus === "completed" && video.s3VideoUrl) {
        try {
          // 7-day presigned URL for playback
          videoUrl = await getPresignedUrl(video.s3VideoUrl, 604800);
          // Download URL via API (generates fresh presigned URL)
          downloadUrl = `/api/download/${video.id}`;
        } catch (err) {
          console.error(`Failed to generate presigned URL for ${video.jobId}:`, err);
        }
      }

      return {
        ...video,
        videoUrl, // Direct playback URL
        downloadUrl, // API endpoint for download
        // Thumbnail URL is already presigned in database
      };
    })
  );

  // Stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = enhancedVideos.filter((v) => new Date(v.createdAt) >= weekAgo).length;
  const renderCompleted = enhancedVideos.filter((v) => v.renderStatus === "completed").length;
  const uploaded = enhancedVideos.filter((v) => v.uploadStatus === "uploaded").length;

  return NextResponse.json({
    videos: enhancedVideos,
    stats: {
      total: enhancedVideos.length,
      thisWeek,
      renderCompleted,
      uploaded,
      renderFailed: enhancedVideos.filter((v) => v.renderStatus === "failed").length,
      uploadFailed: enhancedVideos.filter((v) => v.uploadStatus === "failed").length,
    },
  });
}
