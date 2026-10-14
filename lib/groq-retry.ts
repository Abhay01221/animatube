import { setTimeout as delay } from "node:timers/promises";

function errorMessage(error:unknown):string{
  return error instanceof Error?error.message:String((error as {message?:unknown})?.message??"");
}
export function isGroqRateLimit(error:unknown):boolean{
  const value=error as {status?:number;code?:string;error?:{code?:string}}|null;
  return value?.status===429||value?.code==="rate_limit_exceeded"||value?.error?.code==="rate_limit_exceeded"||/rate limit/i.test(errorMessage(error));
}
function durationMs(value:string):number|undefined{
  const parts=[...value.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)/g)];
  if(!parts.length)return undefined;
  return parts.reduce((sum,part)=>sum+Number(part[1])*({ms:1,s:1000,m:60000,h:3600000}[part[2]]??0),0);
}
export function groqRetryDelay(error:unknown,attempt:number,now=Date.now()):number{
  const headers=(error as {headers?:Headers|Record<string,string>})?.headers;
  const header=(name:string)=>headers instanceof Headers?headers.get(name):Object.entries(headers??{}).find(([key])=>key.toLowerCase()===name)?.[1];
  const retry=header("retry-after");
  let wait:number|undefined;
  if(retry){const seconds=Number(retry);wait=Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-now;}
  if(wait===undefined||!Number.isFinite(wait)||wait<0){
    const suggested=errorMessage(error).match(/try again in\s+([\d.]+\s*(?:ms|s|m|h)(?:[\d.]+\s*(?:ms|s|m|h))*)/i)?.[1];
    wait=suggested?durationMs(suggested):undefined;
    if(wait===undefined){const reset=header("x-ratelimit-reset-tokens");wait=reset?durationMs(reset):undefined;}
  }
  // Leave a safety margin for clock drift and token-window refill.
  return Math.ceil(Math.max(1000,wait??Math.min(60000,15000*2**(attempt-1))))+1000;
}
export async function withGroqRateLimitRetry<T>(operation:()=>PromiseLike<T>,onLog?:(message:string)=>void,options:{sleep?:(ms:number)=>Promise<void>;now?:()=>number;random?:()=>number;maxAttempts?:number;waitBudgetMs?:number}={}):Promise<T>{
  const attempts=options.maxAttempts??5,budget=options.waitBudgetMs??180000;
  let waited=0;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await operation();}catch(error){
      if(!isGroqRateLimit(error))throw error;
      const wait=groqRetryDelay(error,attempt,options.now?.()??Date.now())+Math.floor((options.random?.()??Math.random())*1000);
      if(attempt===attempts||waited+wait>budget)throw new Error(`Groq's token limit is still busy. Wait ${Math.ceil(wait/1000)} seconds, then use Resume generation. Your instructions are saved.`);
      onLog?.(`Groq token limit reached. Waiting ${Math.ceil(wait/1000)} seconds before automatic retry ${attempt+1}/${attempts}. Your instructions are saved.`);
      await (options.sleep??(ms=>delay(ms)))(wait);waited+=wait;
    }
  }
  throw new Error("Groq retry attempts exhausted. Resume generation later.");
}
