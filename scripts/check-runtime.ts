import { loadEnvConfig } from "@next/env";
import IORedis from "ioredis";
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
async function main(){
  const {prisma}=await import("../lib/prisma");
  const {getVideoQueue,getUploadQueue,closeQueues}=await import("../lib/queue");
  try{
    await prisma.user.findFirst();
    await prisma.video.findFirst();
    console.log("Application database queries succeeded.");
    const redisUrl=process.env.REDIS_URL;
    if(!redisUrl)throw new Error("REDIS_URL is required");
    const redis=new IORedis(redisUrl,{lazyConnect:true,connectTimeout:5000,maxRetriesPerRequest:1,retryStrategy:()=>null,tls:redisUrl.startsWith("rediss://")?{rejectUnauthorized:true}:undefined});
    redis.on("error",()=>{});
    try{await redis.connect();await redis.ping();}finally{redis.disconnect();}
    console.log(JSON.stringify({database:"ready",channelProfiles:await prisma.channelProfile.count(),pendingOutbox:await prisma.jobOutbox.count({where:{status:"pending"}}),renderQueue:await getVideoQueue().getJobCounts(),uploadQueue:await getUploadQueue().getJobCounts()}));
  }finally{await closeQueues();await prisma.$disconnect();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Runtime check failed");process.exitCode=1;});
