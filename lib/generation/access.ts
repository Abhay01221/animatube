import { prisma } from "../prisma";
import { ApiError } from "../server-auth";
export async function ownedVideo(jobId:string,userId:string) {
  const video=await prisma.video.findFirst({where:{jobId,userId,deletedAt:null}});
  if(!video)throw new ApiError(404,"Job not found");
  return video;
}
export function canResumeVideo(video:{renderStatus:string;executionLease:Date|null;approvedRevision:number|null;renderRevision:number}) {
  if(video.executionLease && video.executionLease>new Date())return false;
  if(video.renderStatus==="awaiting_approval")return video.approvedRevision===video.renderRevision;
  return ["failed","interrupted","processing","retrying","pending"].includes(video.renderStatus);
}
