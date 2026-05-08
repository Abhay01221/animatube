/**
 * YouTube Data API v3 helpers.
 * Uses the googleapis npm package with OAuth2 credentials from the DB.
 */
import { google } from "googleapis";
import { decrypt } from "./encrypt";
import { prisma } from "./prisma";
import type { Readable } from "stream";

/** Build an authenticated YouTube client for a given user. */
export async function getYouTubeClient(userId: string) {
  console.log(`[YouTube] Getting client for user: ${userId}`);
  
  const user = await prisma.user.findUnique({ 
    where: { id: userId },
    select: { youtubeTokens: true, email: true }
  });
  
  if (!user?.youtubeTokens) {
    console.error(`[YouTube] No YouTube tokens found for user ${userId}`);
    throw new Error("No YouTube tokens found. Please reconnect your YouTube account in Settings.");
  }

  // Decrypt stored tokens
  let tokens: {
    access_token: string;
    refresh_token?: string;
    expiry_date: number;
  };
  
  try {
    const tokensJson = decrypt(user.youtubeTokens);
    tokens = JSON.parse(tokensJson);
  } catch (err) {
    console.error(`[YouTube] Failed to decrypt tokens for user ${userId}:`, err);
    throw new Error("Failed to decrypt YouTube tokens. Please reconnect your YouTube account in Settings.");
  }

  console.log(`[YouTube] Access token exists:`, !!tokens.access_token);
  console.log(`[YouTube] Refresh token exists:`, !!tokens.refresh_token);
  console.log(`[YouTube] Token expiry:`, new Date(tokens.expiry_date).toISOString());
  console.log(`[YouTube] Token expired:`, tokens.expiry_date < Date.now());

  // Check if refresh token is missing
  if (!tokens.refresh_token) {
    console.error(`[YouTube] ⚠️ No refresh token available for user ${userId}`);
    throw new Error("YouTube refresh token missing. Please sign out and sign in again to reconnect YouTube.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Auto-refresh if expired
  oauth2Client.on("tokens", async (newTokens) => {
    console.log(`[YouTube] Tokens refreshed for user ${userId}`);
    console.log(`[YouTube] New access token:`, !!newTokens.access_token);
    console.log(`[YouTube] New refresh token:`, !!newTokens.refresh_token);
    
    try {
      // Merge new tokens with existing, preserving refresh_token if not provided
      const merged = {
        access_token: newTokens.access_token ?? tokens.access_token,
        refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
        expiry_date: newTokens.expiry_date ?? Date.now() + 3600 * 1000,
      };
      
      const { encrypt } = await import("./encrypt");
      const encryptedTokens = encrypt(JSON.stringify(merged));
      
      await prisma.user.update({
        where: { id: userId },
        data: { youtubeTokens: encryptedTokens },
      });
      
      console.log(`[YouTube] ✓ Refreshed tokens saved to database`);
    } catch (err) {
      console.error(`[YouTube] Failed to save refreshed tokens:`, err);
    }
  });

  return google.youtube({ version: "v3", auth: oauth2Client });
}

export interface UploadVideoOptions {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: string;
  videoStream: Readable;
  fileSize?: number;
}

/** Upload a video to YouTube and return the video ID. */
export async function uploadVideoToYouTube(
  userId: string,
  options: UploadVideoOptions
): Promise<string> {
  const youtube = await getYouTubeClient(userId);

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: options.title,
        description: options.description,
        tags: options.tags,
        categoryId: "22", // People & Blogs
        defaultLanguage: "en",
      },
      status: {
        privacyStatus: options.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      mimeType: "video/mp4",
      body: options.videoStream,
    },
  });

  const videoId = response.data.id;
  if (!videoId) throw new Error("YouTube upload returned no video ID");
  return videoId;
}

/** Upload a thumbnail image (Buffer) to a YouTube video. */
export async function uploadThumbnail(
  userId: string,
  videoId: string,
  imageBuffer: Buffer
): Promise<void> {
  const youtube = await getYouTubeClient(userId);
  const { Readable } = await import("stream");

  await youtube.thumbnails.set({
    videoId,
    media: {
      mimeType: "image/png",
      body: Readable.from(imageBuffer),
    },
  });
}
