import { NextResponse } from "next/server";
import { requireUser,apiError } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { assetFromVideo,getAssetUrl } from "@/lib/assets";
import { canResumeVideo } from "@/lib/generation/access";
import { fingerprint } from "@/lib/generation/checkpoints";
export async function GET(req:Request){
  try{
    const user=await requireUser(req);
    const trash=new URL(req.url).searchParams.get("trash")==="1";
    const rows=await prisma.video.findMany({where:{userId:user.id,deletedAt:trash?{not:null}:null},orderBy:{createdAt:"desc"},take:100});
    const videos=await Promise.all(rows.map(async video=>{
      let videoUrl:string|null=null;const asset=assetFromVideo(video);
      if(!trash&&video.renderStatus==="completed"&&asset)try{videoUrl=await getAssetUrl(asset,3600);}catch{ /* Playback can retry through the authenticated download endpoint. */ }
      if(video.thumbnailKey)try{video.thumbnailUrl=await getAssetUrl({provider:"s3",key:video.thumbnailKey},3600);}catch{video.thumbnailUrl=null;}
      return {id:video.id,jobId:video.jobId,deletedAt:video.deletedAt,playbackKey:fingerprint({asset,revision:video.renderRevision}),status:video.status,renderStatus:video.renderStatus==="processing"&&video.executionLease&&video.executionLease<new Date()?"interrupted":video.renderStatus,uploadStatus:video.uploadStatus,subtitlesAdded:video.subtitlesAdded,prompt:video.prompt,style:video.style,duration:video.duration,title:video.title,youtubeId:video.youtubeId,youtubeUrl:video.youtubeUrl,visibility:video.visibility,videoUrl,downloadUrl:`/api/download/${video.id}`,thumbnailUrl:video.thumbnailUrl,renderError:video.renderError,uploadError:video.uploadError,createdAt:video.createdAt,updatedAt:video.updatedAt,resumeAvailable:canResumeVideo(video)};
    }));
    const completed=videos.filter(v=>v.renderStatus==="completed").length;const failed=videos.filter(v=>["failed","interrupted"].includes(v.renderStatus)).length;
    return NextResponse.json({videos,credits:user.credits,stats:{total:videos.length,completed,failed,renderCompleted:completed,renderFailed:failed,uploaded:videos.filter(v=>v.uploadStatus==="uploaded").length,uploadFailed:videos.filter(v=>v.uploadStatus==="failed").length,thisWeek:videos.filter(v=>v.createdAt.getTime()>Date.now()-604800000).length}});
  }catch(error){return apiError(error);}
}
