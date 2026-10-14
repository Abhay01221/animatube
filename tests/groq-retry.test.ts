import test from "node:test";
import assert from "node:assert/strict";
import { groqRetryDelay,withGroqRateLimitRetry } from "../lib/groq-retry";

test("Groq retry honors fractional retry-after and error-message delays",()=>{
  assert.equal(groqRetryDelay({headers:new Headers({"retry-after":"5.7225"})},1),6723);
  assert.equal(groqRetryDelay({message:"Please try again in 5.7225s."},1),6723);
  assert.equal(groqRetryDelay({headers:{"x-ratelimit-reset-tokens":"1m2.5s"}},1),63500);
  assert.equal(groqRetryDelay({headers:{"retry-after":"Thu, 01 Jan 1970 00:01:00 GMT"}},1,0),61000);
});
test("temporary rate limit retries the same operation after the required wait",async()=>{
  let calls=0;const waits:number[]=[],logs:string[]=[];
  const result=await withGroqRateLimitRetry(async()=>{if(++calls<3)throw {status:429,headers:{"retry-after":"8"}};return "saved plan";},message=>logs.push(message),{sleep:async ms=>{waits.push(ms);},random:()=>0});
  assert.equal(result,"saved plan");assert.deepEqual(waits,[9000,9000]);assert.equal(calls,3);assert.match(logs[0],/automatic retry/);
});
test("daily limits and exhausted attempts stop with saved-instructions guidance",async()=>{
  let calls=0,waits=0;
  await assert.rejects(withGroqRateLimitRetry(async()=>{calls++;throw {status:429,message:"Please try again in 2h."};},undefined,{sleep:async()=>{waits++;},random:()=>0}),/Resume generation/);
  assert.equal(calls,1);assert.equal(waits,0);
  await assert.rejects(withGroqRateLimitRetry(async()=>{throw {status:429,headers:{"retry-after":"1"}};},undefined,{maxAttempts:2,sleep:async()=>{},random:()=>0}),/instructions are saved/);
});
test("authentication and invalid structured output are not retried as throttling",async()=>{
  let calls=0;const error=new Error("Invalid structured output");
  await assert.rejects(withGroqRateLimitRetry(async()=>{calls++;throw error;}),value=>value===error);assert.equal(calls,1);
});
