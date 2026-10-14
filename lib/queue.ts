import { Queue, QueueEvents } from "bullmq";
import { createRedisConnection } from "./redis";
import type { AssetRef } from "./assets";
export const VIDEO_QUEUE_NAME = "video-generation";
export const UPLOAD_QUEUE_NAME = "youtube-upload";
export interface VideoJobData {
  jobId: string; userId: string; queueVersion?: number; renderRevision?: number;
  prompt?: string; style?: string; duration?: string; voice?: string; language?: string; visibility?: string;
  reuploadOnly?: boolean; finalVideoS3Key?: string; title?: string; description?: string; tags?: string[];
}
export interface UploadJobData {
  jobId:string; userId:string; asset:AssetRef; title:string; description:string; tags:string[];
  visibility:string; language?:string; renderRevision?:number;
}
let videoQueueInstance: Queue<VideoJobData> | undefined;
let uploadQueueInstance: Queue<UploadJobData> | undefined;
let videoEvents: QueueEvents | undefined;
let uploadEvents: QueueEvents | undefined;
export function getVideoQueue() {
  return videoQueueInstance ??= new Queue<VideoJobData>(VIDEO_QUEUE_NAME, { connection:createRedisConnection("producer"), defaultJobOptions:{attempts:3,backoff:{type:"exponential",delay:5000},removeOnComplete:{age:604800},removeOnFail:{age:604800}} });
}
export function getUploadQueue() {
  return uploadQueueInstance ??= new Queue<UploadJobData>(UPLOAD_QUEUE_NAME, { connection:createRedisConnection("producer"), defaultJobOptions:{attempts:5,backoff:{type:"exponential",delay:10000},removeOnComplete:{age:604800},removeOnFail:{age:604800}} });
}
export const getVideoQueueEvents = () => videoEvents ??= new QueueEvents(VIDEO_QUEUE_NAME,{connection:createRedisConnection()});
export const getUploadQueueEvents = () => uploadEvents ??= new QueueEvents(UPLOAD_QUEUE_NAME,{connection:createRedisConnection()});
export async function closeQueues() {
  const clients=await Promise.all([videoQueueInstance?.client,uploadQueueInstance?.client,videoEvents?.client,uploadEvents?.client]);
  await Promise.all([videoQueueInstance?.close(),uploadQueueInstance?.close(),videoEvents?.close(),uploadEvents?.close()]);
  // These connections were supplied by our factory, so BullMQ does not own them.
  await Promise.all(clients.map(client=>client?.quit()));
  videoQueueInstance=undefined;uploadQueueInstance=undefined;videoEvents=undefined;uploadEvents=undefined;
}
