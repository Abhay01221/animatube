/** Publishing reads the approved cloud artifact; it never regenerates media. */
import { assetFromVideo, openAssetStream, type AssetRef } from "../assets";
import { uploadVideoToYouTube } from "../youtube";
import { prisma } from "../prisma";

export async function uploadToYouTube(jobId: string, userId: string, finalAsset: string | AssetRef,
  title: string, description: string, tags: string[], privacyStatus: string,
  _tmpDir: string, onLog?: (message: string) => void, language?: string): Promise<{ youtubeId: string; youtubeUrl: string }> {
  const video = await prisma.video.findFirst({ where: { jobId, userId } });
  if (!video) throw new Error("Video not found");
  if (video.youtubeId) return { youtubeId: video.youtubeId, youtubeUrl: video.youtubeUrl || `https://www.youtube.com/watch?v=${video.youtubeId}` };
  const storedAsset = assetFromVideo(video);
  const asset = typeof finalAsset === "string" ? storedAsset : finalAsset;
  if (!asset || !storedAsset || asset.provider !== storedAsset.provider || asset.key !== storedAsset.key) {
    throw new Error("The approved video artifact is unavailable or changed");
  }
  onLog?.(`Publishing approved video (${privacyStatus})`);
  const stream = await openAssetStream(asset);
  try {
    const youtubeId = await uploadVideoToYouTube(userId, { title, description, tags, privacyStatus,
      videoStream: stream, language: language || video.language });
    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    // Persist the returned ID immediately; subsequent retries reuse it.
    await prisma.video.update({ where: { jobId }, data: { youtubeId, youtubeUrl, uploadStatus: "uploaded", uploadError: null } });
    onLog?.(`YouTube upload complete (${privacyStatus})`);
    return { youtubeId, youtubeUrl };
  } finally { stream.destroy(); }
}
