/** Local Windows development queue, using Redis from Ubuntu's package repository. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync,writeFileSync } from "node:fs";
import { parse } from "dotenv";
import IORedis from "ioredis";
async function main(){
  const existing=readFileSync(".env.local","utf8");
  const configured=parse(existing).REDIS_URL;
  if(configured&&!configured.startsWith("redis://default:")||configured&&!configured.includes("@127.0.0.1:6380"))throw new Error("A different local REDIS_URL is already configured; preserve it and inspect before changing");
  const saved=spawnSync("wsl",["-d","Ubuntu","-u","root","--","cat","/var/lib/animatube-redis/redis.conf"],{encoding:"utf8",timeout:30000});
  const savedPassword=saved.status===0?saved.stdout.match(/^requirepass ([a-f0-9]+)$/m)?.[1]:undefined;
  const password=configured?new URL(configured).password:savedPassword??randomBytes(32).toString("hex");
  const run=(args:string[],input?:string)=>{
    const result=spawnSync("wsl",["-d","Ubuntu","-u","root","--",...args],{input,encoding:"utf8",timeout:30000});
    if(result.error||result.status!==0)throw new Error("Local Redis setup failed. Install redis-server in Ubuntu WSL first.");
  };
  run(["mkdir","-p","/var/lib/animatube-redis"]);
  const conf=["bind 127.0.0.1","port 6380","protected-mode yes",`requirepass ${password}`,"dir /var/lib/animatube-redis","appendonly yes","appendfsync everysec","maxmemory-policy noeviction","daemonize yes","pidfile /var/lib/animatube-redis/redis.pid","logfile /var/lib/animatube-redis/redis.log"].join("\n")+"\n";
  run(["tee","/var/lib/animatube-redis/redis.conf"],conf);
  run(["chmod","600","/var/lib/animatube-redis/redis.conf"]);
  const redisUrl=`redis://default:${password}@127.0.0.1:6380`;
  const ping=async()=>{
    const redis=new IORedis(redisUrl,{lazyConnect:true,connectTimeout:5000,retryStrategy:()=>null});redis.on("error",()=>{});
    try{await redis.connect();await redis.ping();}finally{redis.disconnect();}
  };
    try{await ping();}catch{run(["redis-server","/var/lib/animatube-redis/redis.conf"]);await ping();}
    const updated=configured?existing.replace(/^REDIS_URL=.*$/m,`REDIS_URL=${redisUrl}`):existing.trimEnd()+`\n\n# Local persistent development queue; cloud configuration remains in .env\nREDIS_URL=${redisUrl}\n`;
    writeFileSync(".env.local",updated,{mode:0o600});
    console.log("Local persistent Redis is ready on 127.0.0.1:6380; local environment updated without changing cloud credentials.");
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Local Redis setup failed");process.exitCode=1;});
