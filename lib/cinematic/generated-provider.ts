import { createWriteStream } from "node:fs";
import { Readable,Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { GeneratedVisualProvider } from "../stages/cinematic-visuals";
export function generatedVisualCapabilities(){
  const enabled=!!process.env.GENERATED_VISUAL_ENDPOINT;
  const price=Number(process.env.GENERATED_VISUAL_USD_PER_SECOND);
  return {enabled,provider:enabled?(process.env.GENERATED_VISUAL_PROVIDER??"Configured visual service"):null,estimatedUsdPerSecond:Number.isFinite(price)&&price>=0?price:null};
}
export function configuredGeneratedProvider():GeneratedVisualProvider|undefined{
  const endpoint=process.env.GENERATED_VISUAL_ENDPOINT;if(!endpoint)return undefined;
  const url=new URL(endpoint);if(url.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&["localhost","127.0.0.1"].includes(url.hostname)))throw new Error("Generated visual service must use HTTPS");
  return {id:process.env.GENERATED_VISUAL_PROVIDER??url.hostname,generate:async input=>{
    const signal=AbortSignal.any([AbortSignal.timeout(180000),...(input.signal?[input.signal]:[])]);
    const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",...(process.env.GENERATED_VISUAL_API_KEY?{Authorization:`Bearer ${process.env.GENERATED_VISUAL_API_KEY}`}:{})},body:JSON.stringify({prompt:input.prompt,sceneIndex:input.sceneIndex,duration:input.duration,width:input.width,height:input.height}),signal});
    if(!response.ok||!response.body)throw new Error(`Visual generation service failed (${response.status})`);
    const contentType=response.headers.get("content-type")?.split(";")[0];
    if(!["image/png","image/jpeg","image/webp","video/mp4"].includes(contentType??""))throw new Error("Generated visual service must return PNG, JPEG, WebP, or MP4 bytes");
    let total=0;const limiter=new Transform({transform(chunk:Buffer,_encoding,done){total+=chunk.length;if(total>50*1024*1024)done(new Error("Generated visual exceeds 50 MB"));else done(null,chunk);}});
    await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>),limiter,createWriteStream(input.targetPath),{signal});
    return {type:contentType==="video/mp4"?"clip":"image",localPath:input.targetPath};
  }};
}
