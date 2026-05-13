/**
 * GET /api/projects/:id/download
 * 
 * Download the final video file from local library.
 * Available as soon as renderStatus is "completed".
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export async function GET(
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
      console.error("[project-download] Token verification failed:", error);
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
        { error: "Video is not ready for download yet" },
        { status: 400 }
      );
    }

    // Check if local file exists
    if (!video.localFilePath) {
      return NextResponse.json(
        { error: "Local video file not found" },
        { status: 404 }
      );
    }

    // Verify file exists on disk
    if (!fs.existsSync(video.localFilePath)) {
      return NextResponse.json(
        { error: "Video file not found on server" },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = fs.readFileSync(video.localFilePath);
    const fileName = `${video.title || 'video'}.mp4`.replace(/[^a-z0-9_\-\.]/gi, '_');

    // Return the file
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error("[Download API] Error:", error);
    return NextResponse.json(
      { error: "Failed to download video" },
      { status: 500 }
    );
  }
}
