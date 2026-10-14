import { readManifest,STAGES } from "./checkpoints";
const NAMES=["Writing script","Generating voiceover","Preparing visuals","Assembling video","Adding captions","Saving video"];
export function progressStages(value:unknown,renderStatus:string){
  const manifest=readManifest(value);
  return STAGES.map((key,index)=>{
    const checkpoint=manifest.stages[key];
    const status=checkpoint?.status==="completed"?"done":checkpoint?.status==="running"?"active":checkpoint?.status==="failed"&&renderStatus==="failed"?"error":"pending";
    return {stage:index+1,name:NAMES[index],status,log:checkpoint?.error??(checkpoint?.elapsedMs?`${Math.round(checkpoint.elapsedMs/1000)}s`:undefined)};
  });
}
export function publicManifest(value:unknown){
  const manifest=readManifest(value);
  return {version:manifest.version,updatedAt:manifest.updatedAt,stages:Object.fromEntries(STAGES.map(key=>{const c=manifest.stages[key];return [key,c?{status:c.status,attempts:c.attempts,startedAt:c.startedAt,completedAt:c.completedAt,elapsedMs:c.elapsedMs,error:c.error}:null];}))};
}
