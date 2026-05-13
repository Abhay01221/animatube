/**
 * POST /api/projects/:id/upload
 * 
 * Trigger YouTube upload for a completed video.
 * This is completely independent from rendering.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getUploadQueue } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    
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
      console.error("[project-upload] Token verification failed:", error);
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

    // Find the video project
    const video = await prisma.video.findFirst({
      where: {
        id: projectId,
        userId: currentUser.id,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Check if render is complete
    if (video.renderStatus !== "completed") {
      return NextResponse.json(
        { error: "Video rendering must be completed before upload" },
        { status: 400 }
      );
    }

    // Check if local file exists
    if (!video.localFilePath) {
      return NextResponse.json(
        { error: "Local video file not found" },
        { status: 400 }
      );
    }

    // Check if already uploaded
    if (video.uploadStatus === "uploaded") {
      return NextResponse.json(
        { 
          message: "Video already uploaded to YouTube",
          youtubeUrl: video.youtubeUrl,
        },
        { status: 200 }
      );
    }

    // Check if already queued/uploading
    if (video.uploadStatus === "queued" || video.uploadStatus === "uploading") {
      return NextResponse.json(
        { message: "Upload already in progress" },
        { status: 200 }
      );
    }

    // Queue the upload job
    await getUploadQueue().add("upload-video", {
      jobId: video.jobId,
      userId: video.userId,
      localFilePath: video.localFilePath,
      title: video.title || "Untitled Video",
      description: video.description || "",
      tags: video.tags || [],
      visibility: video.visibility,
    });

    // Update status to queued
    await prisma.video.update({
      where: { id: projectId },
      data: { uploadStatus: "queued" },
    });

    return NextResponse.json({
      message: "Upload queued successfully",
      uploadStatus: "queued",
    });

  } catch (error) {
    console.error("[Upload API] Error:", error);
    return NextResponse.json(
      { error: "Failed to queue upload" },
      { status: 500 }
    );
  }
}
