import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main(){
  const [{createVideoWorker},{createUploadWorker},{dispatchOutbox},{closeQueues},{prisma},{reconcileInterruptedJobs}]=await Promise.all([import("./lib/workers/video-worker"),import("./lib/workers/upload-worker"),import("./lib/generation/outbox"),import("./lib/queue"),import("./lib/prisma"),import("./lib/generation/reconcile")]);
  const render=createVideoWorker();const upload=createUploadWorker();
  let dispatching=false;let stopping=false;
  const dispatch=async()=>{if(dispatching||stopping)return;dispatching=true;try{await dispatchOutbox();await reconcileInterruptedJobs();}catch(error){console.error("[Outbox] Dispatch unavailable",error instanceof Error?error.name:"UnknownError");}finally{dispatching=false;}};
  const timer=setInterval(()=>void dispatch(),5000);void dispatch();
  const shutdown=async()=>{if(stopping)return;stopping=true;clearInterval(timer);await Promise.all([render.close(),upload.close()]);await closeQueues();await prisma.$disconnect();process.exit(0);};
  process.once("SIGTERM",()=>void shutdown());process.once("SIGINT",()=>void shutdown());
  console.log("Animatube rendering, publishing, and durable outbox workers started.");
}
void main().catch(error=>{console.error("Worker startup failed",error instanceof Error?error.message:"UnknownError");process.exitCode=1;});
