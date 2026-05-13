/**
 * GET /api/storyboard/[jobId]
 * Returns storyboard preview for a job before final rendering.
 * Allows users to review and potentially edit scenes before processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import type { Storyboard, StoryboardScene } from "@/lib/types/cinematic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
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
    console.error("[storyboard] Token verification failed:", error);
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

  const { jobId } = await params;

  // Fetch video record
  const video = await prisma.video.findUnique({
    where: { jobId },
  });

  if (!video) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Check ownership
  if (video.userId !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if storyboard data exists
  if (!video.storyboard) {
    return NextResponse.json(
      { error: "Storyboard not yet generated" },
      { status: 404 }
    );
  }

  return NextResponse.json(video.storyboard);
}

/**
 * POST /api/storyboard/[jobId]
 * Update storyboard scenes (for future editing feature)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
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
    console.error("[storyboard] Token verification failed:", error);
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

  const { jobId } = await params;

  // Fetch video record
  const video = await prisma.video.findUnique({
    where: { jobId },
  });

  if (!video) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Check ownership
  if (video.userId !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse updated storyboard
  let updatedStoryboard: Storyboard;
  try {
    updatedStoryboard = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Update storyboard in database
  await prisma.video.update({
    where: { jobId },
    data: { storyboard: updatedStoryboard as any },
  });

  return NextResponse.json({ success: true });
}
