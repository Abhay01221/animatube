import { google } from "googleapis";
import type { Credentials } from "google-auth-library";
import type { Readable } from "node:stream";
import { decrypt, encrypt } from "./encrypt";
import { prisma } from "./prisma";

export function youtubeAppUrl(): URL {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (!raw) throw new Error("APP_URL must be configured for YouTube authorization");
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("APP_URL must use HTTPS in production");
  return url;
}
export function createYouTubeOAuthClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("YouTube OAuth credentials are not configured");
  return new google.auth.OAuth2(id, secret, new URL("/api/youtube/callback", youtubeAppUrl()).href);
}
export async function saveYouTubeTokens(userId: string, tokens: Credentials): Promise<void> {
  if (!tokens.refresh_token) throw new Error("YouTube did not provide offline access. Reconnect and grant access.");
  await prisma.user.update({ where: { id: userId }, data: { youtubeTokens: encrypt(JSON.stringify(tokens)) } });
}
export async function getYouTubeClient(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { youtubeTokens: true } });
  if (!user?.youtubeTokens) throw new Error("Connect your YouTube account in Settings first.");
  let tokens: Credentials;
  try { tokens = JSON.parse(decrypt(user.youtubeTokens)) as Credentials; }
  catch { throw new Error("Your YouTube connection must be renewed in Settings."); }
  if (!tokens.refresh_token) throw new Error("Reconnect YouTube in Settings to enable offline publishing.");
  const auth = createYouTubeOAuthClient();
  auth.setCredentials(tokens);
  if (!tokens.access_token || !tokens.expiry_date || tokens.expiry_date < Date.now() + 60000) {
    const refreshed = await auth.refreshAccessToken();
    tokens = { ...tokens, ...refreshed.credentials, refresh_token: refreshed.credentials.refresh_token || tokens.refresh_token };
    auth.setCredentials(tokens);
    await saveYouTubeTokens(userId, tokens);
  }
  return google.youtube({ version: "v3", auth });
}
export interface UploadVideoOptions {
  title: string; description: string; tags: string[]; privacyStatus: string;
  videoStream: Readable; fileSize?: number; language?: string;
}
export function youtubeLanguage(language?: string): string {
  return ({ english: "en", hindi: "hi", spanish: "es" } as Record<string, string>)[language || "english"] || "en";
}
export async function uploadVideoToYouTube(userId: string, options: UploadVideoOptions): Promise<string> {
  if (!["private", "unlisted", "public"].includes(options.privacyStatus)) throw new Error("Invalid YouTube visibility");
  const youtube = await getYouTubeClient(userId);
  const response = await youtube.videos.insert({ part: ["snippet", "status"], requestBody: {
    snippet: { title: options.title.slice(0, 100), description: options.description.slice(0, 5000), tags: options.tags,
      categoryId: "27", defaultLanguage: youtubeLanguage(options.language), defaultAudioLanguage: youtubeLanguage(options.language) },
    status: { privacyStatus: options.privacyStatus, selfDeclaredMadeForKids: false },
  }, media: { mimeType: "video/mp4", body: options.videoStream } }, { timeout: 30 * 60 * 1000 });
  if (!response.data.id) throw new Error("YouTube upload returned no video ID");
  return response.data.id;
}
export async function uploadThumbnail(userId: string, videoId: string, imageBuffer: Buffer): Promise<void> {
  const youtube = await getYouTubeClient(userId);
  const { Readable } = await import("node:stream");
  await youtube.thumbnails.set({ videoId, media: { mimeType: "image/png", body: Readable.from(imageBuffer) } }, { timeout: 60000 });
}
