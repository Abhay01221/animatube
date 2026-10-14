import { prisma } from "../prisma";
import { getVideoQueue,getUploadQueue,type VideoJobData,type UploadJobData } from "../queue";
export interface OutboxTransport {render:(payload:VideoJobData,id:string)=>Promise<unknown>;upload:(payload:UploadJobData,id:string)=>Promise<unknown>}
export async function dispatchOutbox(limit=10,transport:OutboxTransport={render:(payload,id)=>getVideoQueue().add("render",payload,{jobId:id}),upload:(payload,id)=>getUploadQueue().add("upload",payload,{jobId:id})}) {
  const now=new Date();
  const rows=await prisma.jobOutbox.findMany({where:{OR:[{status:"pending",OR:[{leaseUntil:null},{leaseUntil:{lt:now}}]},{status:"dispatching",leaseUntil:{lt:now}}]},orderBy:{createdAt:"asc"},take:limit});
  for(const row of rows) {
    if(row.kind==="purge"){await (await import("./permanent-deletion")).processPermanentDeletion(row.id);continue;}
    const leaseUntil=new Date(Date.now()+60000);
    const claimed=await prisma.jobOutbox.updateMany({where:{id:row.id,OR:[{status:"pending"},{status:"dispatching",leaseUntil:{lt:now}}]},data:{status:"dispatching",leaseUntil,attempts:{increment:1}}});
    if(!claimed.count) continue;
    try {
      if(row.kind==="render") await transport.render(row.payload as unknown as VideoJobData,row.id);
      else await transport.upload(row.payload as unknown as UploadJobData,row.id);
      await prisma.jobOutbox.update({where:{id:row.id},data:{status:"sent",dispatchedAt:new Date(),leaseUntil:null,lastError:null}});
    }catch(error) {
      await prisma.jobOutbox.update({where:{id:row.id},data:{status:"pending",leaseUntil:null,lastError:error instanceof Error?error.message:"Queue unavailable"}});
    }
  }
}
