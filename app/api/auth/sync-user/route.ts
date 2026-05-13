/**
 * POST /api/auth/sync-user
 * Syncs Firebase authenticated user to Prisma database.
 * Called after successful Firebase authentication.
 * Creates or updates user record with Firebase UID.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // Get Firebase ID token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.split("Bearer ")[1];

    // Verify Firebase token
    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (error) {
      console.error("[sync-user] Token verification failed:", error);
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const { uid, email, name, picture } = decoded;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Upsert user in Prisma database
    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email,
        name: name || null,
        image: picture || null,
      },
      create: {
        firebaseUid: uid,
        email,
        name: name || null,
        image: picture || null,
        credits: 5, // Default starting credits
        videosGenerated: 0,
      },
    });

    console.log("[sync-user] User synced:", user.email);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        credits: user.credits,
        videosGenerated: user.videosGenerated,
      },
    });
  } catch (error) {
    console.error("[sync-user] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
