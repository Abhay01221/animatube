import { Worker,UnrecoverableError, type Job } from "bullmq";
import { UPLOAD_QUEUE_NAME, type UploadJobData } from "../queue";
import { createRedisConnection } from "../redis";
import { prisma } from "../prisma";
import { assetFromVideo, verifyAsset } from "../assets";
import { uploadToYouTube } from "../stages/upload";

export async function processUploadJob(job: Pick<Job<UploadJobData>,"data"|"attemptsMade"|"opts">,upload:typeof uploadToYouTube=uploadToYouTube): Promise<void> {
  const { jobId, userId, title, description, tags, visibility } = job.data;
  try {
    const video = await prisma.video.findFirst({ where: { jobId, userId } });
    if (!video) return; // Permanent deletion can leave an old queue delivery behind.
    if(video.deletedAt)return;
    if(job.data.renderRevision!==undefined&&job.data.renderRevision!==video.renderRevision)throw new UnrecoverableError("The publishing request belongs to an older render revision");
    if (video.renderStatus !== "completed") throw new Error("Rendering must complete before publishing");
    if (video.youtubeId) {
      await prisma.video.update({ where: { jobId }, data: { uploadStatus: "uploaded", uploadError: null } });
      return;
    }
    const asset = assetFromVideo(video);
    if (!asset || !(await verifyAsset(asset))) throw new Error("The approved rendered video is unavailable");
    if (job.data.asset && (job.data.asset.provider !== asset.provider || job.data.asset.key !== asset.key)) {
      throw new Error("Queued video asset changed. Retry publishing the current approved video.");
    }
    await prisma.video.update({ where: { jobId }, data: { uploadStatus: "uploading", uploadError: null } });
    await upload(jobId, userId, asset, title, description, tags, visibility, "", undefined, job.data.language || video.language);
  } catch (error) {
    const willRetry = !(error instanceof UnrecoverableError)&&job.attemptsMade + 1 < (job.opts.attempts || 1);
    await prisma.video.updateMany({ where: { jobId, userId,...(job.data.renderRevision!==undefined?{renderRevision:job.data.renderRevision}:{}) }, data: {
      uploadStatus: willRetry ? "retrying" : "failed", uploadError: error instanceof Error ? error.message : "Publishing failed",
    } });
    // Throwing is required for BullMQ backoff/attempts to execute.
    throw error;
  }
}
export function createUploadWorker() {
  const worker = new Worker<UploadJobData>(UPLOAD_QUEUE_NAME, job=>processUploadJob(job), { connection: createRedisConnection(), concurrency: 2 });
  worker.on("failed", (job, error) => console.error(`[UploadWorker] Job ${job?.id} failed: ${error.message}`));
  worker.on("error", error => console.error("[UploadWorker] Connection error", error.message));
  return worker;
}
