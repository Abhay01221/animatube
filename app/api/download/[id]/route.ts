/**
 * GET /api/download/[id]
 * Returns a download URL for the final MP4.
 *
 * Priority:
 *   1. video.videoUrl  — permanent Supabase Storage public URL (new)
 *   2. video.s3VideoUrl — presigned S3 URL (legacy fallback)
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getVideoDownloadUrl } from "@/lib/storage";

export async function GET(
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
    console.error("[download] Token verification failed:", error);
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

  if (!video.videoUrl && !video.s3VideoUrl) {
    return NextResponse.json({ error: "Video not ready" }, { status: 400 });
  }

  try {
    const url = await getVideoDownloadUrl(video.videoUrl ?? null, video.s3VideoUrl ?? null);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[download] Failed to get download URL:", err);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}
