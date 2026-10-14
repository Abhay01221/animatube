/**
 * POST /api/auth/sync-user
 * Syncs Firebase authenticated user to Prisma database.
 * Called after successful Firebase authentication.
 * Creates or updates user record with Firebase UID.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { canLinkLegacyAccount } from "@/lib/account-linking";

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

    if (!decoded.email_verified) {
      return NextResponse.json({ error: "Verify your email address before using Animatube." }, { status: 403 });
    }

    // Match Firebase UID first. Older users may have been created before
    // Firebase sync was added and therefore only have an email on the row.
    // Looking up by email prevents the create branch from violating User.email
    // when that user signs in with Google for the first time.
    const existingByUid = await prisma.user.findUnique({
      where: { firebaseUid: uid },
    });
    const existingByEmail = existingByUid
      ? null
      : await prisma.user.findUnique({ where: { email }, include: { accounts: { where: { provider: "google" }, select: { providerAccountId: true } } } });

    if (existingByEmail && !canLinkLegacyAccount({
      emailVerified: decoded.email_verified === true, uid, existingUid: existingByEmail.firebaseUid,
      googleIdentity: decoded.firebase?.identities?.["google.com"]?.[0],
      legacyGoogleIdentities: [existingByEmail.googleId, ...existingByEmail.accounts.map(account => account.providerAccountId)].filter((id): id is string => !!id),
    })) {
      return NextResponse.json({ error: "This email belongs to a different linked account. Sign in using its original provider." }, { status: 409 });
    }

    const user = existingByUid || existingByEmail
      ? await prisma.user.update({
          where: { id: (existingByUid || existingByEmail)!.id },
          data: {
            firebaseUid: uid,
            email,
            emailVerified: new Date(),
            name: name || (existingByUid || existingByEmail)!.name || null,
            image: picture || (existingByUid || existingByEmail)!.image || null,
          },
        })
      : await prisma.user.create({
          data: {
            firebaseUid: uid,
            email,
            emailVerified: new Date(),
            name: name || null,
            image: picture || null,
            credits: 5,
            videosGenerated: 0,
          },
        });

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
    console.error("[sync-user] Error:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
