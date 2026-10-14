import { prisma } from "../prisma";
import { ApiError } from "../server-auth";

export async function moveVideoToTrash(id:string,userId:string){
  const changed=await prisma.video.updateMany({where:{id,userId,deletedAt:null,renderStatus:{notIn:["queued","processing","retrying"]},uploadStatus:{notIn:["queued","uploading","processing","retrying"]},OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},data:{deletedAt:new Date()}});
  if(changed.count)return;
  const video=await prisma.video.findFirst({where:{id,userId}});
  if(!video)throw new ApiError(404,"Video not found");
  if(video.deletedAt)return;
  throw new ApiError(409,"This video is generating or uploading. Wait for it to finish before deleting it.");
}
export async function restoreVideo(id:string,userId:string){
  const changed=await prisma.video.updateMany({where:{id,userId,deletedAt:{not:null},renderStatus:{not:"deleting"}},data:{deletedAt:null}});
  const deleting=await prisma.video.findFirst({where:{id,userId,renderStatus:"deleting"}});
  if(deleting)throw new ApiError(409,"Permanent deletion has started and cannot be undone.");
  if(!changed.count&&!await prisma.video.findFirst({where:{id,userId}}))throw new ApiError(404,"Video not found");
}
