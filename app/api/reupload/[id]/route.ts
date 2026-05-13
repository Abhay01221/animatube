/**
 * POST /api/reupload/[id]
 * Re-triggers the YouTube upload stage for an existing completed video.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { videoQueue } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    console.error("[reupload] Token verification failed:", error);
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

  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video || video.userId !== currentUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!video.s3VideoUrl) {
    return NextResponse.json(
      { error: "No video file available for re-upload" },
      { status: 400 }
    );
  }

  // Parse optional visibility override from body
  let visibility = video.visibility;
  try {
    const body = await req.json();
    if (body.visibility) visibility = body.visibility;
  } catch {
    // use existing visibility
  }

  // Create a new job for just the upload stage
  const newJobId = `reupload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await prisma.video.update({
    where: { id },
    data: {
      jobId: newJobId,
      status: "processing",
      renderStatus: "processing",
      uploadStatus: "not_started",
      youtubeId: null,
      youtubeUrl: null,
      renderError: null,
      uploadError: null,
      visibility,
    },
  });

  await videoQueue.add(
    "reupload-video",
    {
      jobId: newJobId,
      userId: currentUser.id,
      prompt: video.prompt,
      style: video.style,
      duration: video.duration,
      voice: video.voice,
      language: video.language,
      visibility,
      // Signal to worker that this is a re-upload only
      reuploadOnly: true,
      finalVideoS3Key: video.s3VideoUrl,
      title: video.title ?? video.prompt,
      description: video.description ?? "",
      tags: video.tags,
    },
    { jobId: newJobId }
  );

  return NextResponse.json({ jobId: newJobId });
}
