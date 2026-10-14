/**
 * Local File Storage Management
 * 
 * Handles saving final MP4 videos to local library storage.
 * This ensures videos are always accessible regardless of YouTube upload status.
 */
import * as fs from "fs";
import * as path from "path";
import { assetFromVideo, downloadAsset, type AssetRef } from "./assets";
import { prisma } from "./prisma";

// Local library storage path (relative to project root)
const LIBRARY_BASE_PATH = path.join(process.cwd(), "storage", "library");

/**
 * Ensure library directory exists
 */
export function ensureLibraryDirectory(): void {
  if (!fs.existsSync(LIBRARY_BASE_PATH)) {
    fs.mkdirSync(LIBRARY_BASE_PATH, { recursive: true });
    console.log(`[LocalStorage] Created library directory: ${LIBRARY_BASE_PATH}`);
  }
}

/**
 * Get the local file path for a job's final video
 */
export function getLocalFilePath(jobId: string): string {
  const jobDir = getJobDirectory(jobId);
  return path.join(jobDir, "final.mp4");
}

/**
 * Get the local directory for a job
 */
export function getJobDirectory(jobId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error("Invalid job ID");
  const directory = path.resolve(LIBRARY_BASE_PATH, jobId);
  if (!directory.startsWith(path.resolve(LIBRARY_BASE_PATH) + path.sep)) throw new Error("Invalid library path");
  return directory;
}

/**
 * Save final video from S3 to local library
 * 
 * @param jobId - Job ID
 * @param s3Key - S3 key of final video
 * @returns Local file path
 */
export async function saveFinalVideoToLibrary(
  jobId: string,
  s3Key: string | AssetRef
): Promise<string> {
  console.log(`[LocalStorage] Saving final video for job ${jobId}`);
  
  // Ensure library directory exists
  ensureLibraryDirectory();
  
  // Create job-specific directory
  const jobDir = getJobDirectory(jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }
  
  // Download from S3
  console.log(`[LocalStorage] Downloading from S3: ${s3Key}`);
  const video = typeof s3Key === "string" ? await prisma.video.findUnique({ where: { jobId } }) : null;
  const asset = typeof s3Key === "string" ? (video ? assetFromVideo(video) : null) : s3Key;
  if (!asset) throw new Error("Durable video asset reference unavailable");
  
  // Save to local file
  const localPath = getLocalFilePath(jobId);
  await downloadAsset(asset, localPath);
  
  const fileSizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(2);
  console.log(`[LocalStorage] Saved to: ${localPath} (${fileSizeMB} MB)`);
  
  return localPath;
}

/**
 * Check if local file exists for a job
 */
export function localFileExists(jobId: string): boolean {
  const localPath = getLocalFilePath(jobId);
  return fs.existsSync(localPath);
}

/**
 * Get file size in bytes
 */
export function getFileSize(jobId: string): number | null {
  const localPath = getLocalFilePath(jobId);
  if (!fs.existsSync(localPath)) return null;
  
  const stats = fs.statSync(localPath);
  return stats.size;
}

/**
 * Delete local file for a job
 */
export function deleteLocalFile(jobId: string): void {
  const jobDir = getJobDirectory(jobId);
  if (fs.existsSync(jobDir)) {
    fs.rmSync(jobDir, { recursive: true, force: true });
    console.log(`[LocalStorage] Deleted local files for job ${jobId}`);
  }
}

/**
 * Get all videos in library with metadata
 */
export function getLibraryVideos(): Array<{
  jobId: string;
  filePath: string;
  fileSizeMB: number;
  createdAt: Date;
}> {
  ensureLibraryDirectory();
  
  const videos: Array<{
    jobId: string;
    filePath: string;
    fileSizeMB: number;
    createdAt: Date;
  }> = [];
  
  const jobDirs = fs.readdirSync(LIBRARY_BASE_PATH);
  
  for (const jobId of jobDirs) {
    const filePath = getLocalFilePath(jobId);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      videos.push({
        jobId,
        filePath,
        fileSizeMB: stats.size / 1024 / 1024,
        createdAt: stats.birthtime,
      });
    }
  }
  
  return videos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
