import { requireUser,apiError } from "@/lib/server-auth";
import { ownedVideo } from "@/lib/generation/access";
import { progressStages } from "@/lib/generation/status";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(req:Request,{params}:{params:Promise<{jobId:string}>}){
  try{
    const user=await requireUser(req);const {jobId}=await params;await ownedVideo(jobId,user.id);
    const encoder=new TextEncoder();let timer:ReturnType<typeof setTimeout>|undefined;let ended=false;
    const stream=new ReadableStream({
      start(controller){
        const close=()=>{if(ended)return;ended=true;clearTimeout(timer);req.signal.removeEventListener("abort",close);try{controller.close();}catch{ /* Already disconnected. */ }};
        const send=(data:unknown)=>{if(!ended)controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));};
        req.signal.addEventListener("abort",close,{once:true});
        const poll=async()=>{
          try{
            const video=await ownedVideo(jobId,user.id);if(ended)return;
            for(const event of progressStages(video.generationManifest,video.renderStatus))send(event);
            const terminal=["completed","failed","cancelled"].includes(video.renderStatus);
            send({type:"snapshot",renderStatus:video.renderStatus,uploadStatus:video.uploadStatus,terminal});
            if(terminal){send({type:"done",status:video.renderStatus});close();return;}
          }catch{if(!ended)send({type:"warning",log:"Progress connection interrupted; reconnect to restore saved state."});close();return;}
          if(!ended)timer=setTimeout(poll,2500);
        };
        void poll();
      },cancel(){ended=true;clearTimeout(timer);},
    });
    return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no"}});
  }catch(error){return apiError(error);}
}
