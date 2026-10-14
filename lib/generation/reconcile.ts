import { prisma } from "../prisma";
import { getVideoQueue } from "../queue";
import { refundFailedGeneration } from "./submission";
export async function reconcileInterruptedJobs(){
  const rows=await prisma.video.findMany({where:{renderStatus:{in:["processing","retrying"]},updatedAt:{lt:new Date(Date.now()-60000)},OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},take:20});
  for(const row of rows){
    const queued=await getVideoQueue().getJob(`${row.jobId}-render-${row.queueVersion}`);
    const state=await queued?.getState();
    if(state==="failed"){
      const changed=await prisma.video.updateMany({where:{id:row.id,queueVersion:row.queueVersion,OR:[{executionLease:null},{executionLease:{lt:new Date()}}]},data:{status:"failed",renderStatus:"failed",executionToken:null,executionLease:null,renderError:"Worker stopped after exhausting attempts. Resume from saved checkpoints."}});
      if(changed.count)await refundFailedGeneration(row.jobId,row.queueVersion);
    }else if(!queued){
      await prisma.video.updateMany({where:{id:row.id,queueVersion:row.queueVersion},data:{renderStatus:"interrupted",executionToken:null,executionLease:null}});
    }
  }
}
