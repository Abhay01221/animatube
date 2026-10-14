import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import { createServer as httpServer,type Server } from "node:http";
import { createServer as netServer } from "node:net";
import { mkdir,mkdtemp,readFile,rm,copyFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { PrismaClient } from "@prisma/client";
import type { Job } from "bullmq";
import type { VideoJobData } from "../lib/queue";
import type { VideoWorkerProviders } from "../lib/workers/video-worker";
import { currentSchemaSql } from "../scripts/prepare-test-db";
import { GenerationSchema } from "../lib/generation/config";
import { readManifest } from "../lib/generation/checkpoints";

let db:PGlite,server:PGLiteSocketServer,storage:Server,prisma:PrismaClient;
let submissions:typeof import("../lib/generation/submission");
let renderedId:string,renderedUserId:string;
const objects=new Map<string,Buffer>();let workDir:string;
const deletionFailures=new Set<string>();
const objectVersions=new Map<string,string[]>();
async function unusedPort(){const server=netServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;}
before(async()=>{
  workDir=await mkdtemp(join(tmpdir(),"animatube-integration-"));
  process.env.PG_POOL_MAX="1";
  db=await PGlite.create();await db.exec(currentSchemaSql());
  const port=await unusedPort();server=new PGLiteSocketServer({db,port,host:"127.0.0.1",maxConnections:4});await server.start();
  process.env.DATABASE_URL=`postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  process.env.AWS_ACCESS_KEY_ID="test-access-key";process.env.AWS_SECRET_ACCESS_KEY="test-secret-key";process.env.AWS_REGION="us-east-1";process.env.AWS_S3_BUCKET="test-videos";
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION="WHEN_REQUIRED";delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  storage=httpServer(async(req,res)=>{
    const url=new URL(req.url??"/","http://localhost"),key=decodeURIComponent(url.pathname);
    const xml=(text:string)=>{res.setHeader("Content-Type","application/xml");res.end(text);};
    if(req.method==="GET"&&["/test-videos","/test-videos/"].includes(key)&&url.searchParams.get("list-type")==="2"){
      const prefix=url.searchParams.get("prefix")??"";
      xml(`<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${[...objects.keys()].filter(k=>k.startsWith(`/test-videos/${prefix}`)).map(k=>`<Contents><Key>${k.slice(13)}</Key></Contents>`).join("")}</ListBucketResult>`);return;
    }
    if(req.method==="GET"&&["/test-videos","/test-videos/"].includes(key)&&url.searchParams.has("versions")){
      const prefix=url.searchParams.get("prefix")??"";
      xml(`<ListVersionsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>false</IsTruncated>${[...objectVersions.entries()].filter(([k])=>k.startsWith(prefix)).flatMap(([k,versions])=>versions.map(v=>`<Version><Key>${k}</Key><VersionId>${v}</VersionId></Version>`)).join("")}</ListVersionsResult>`);return;
    }
    if(req.method==="DELETE"&&key.startsWith("/test-videos/")){
      if(deletionFailures.has(key)){res.statusCode=403;xml("<Error><Code>AccessDenied</Code></Error>");return;}
      const version=url.searchParams.get("versionId"),versions=objectVersions.get(key.slice(13));
      if(version&&versions){const left=versions.filter(v=>v!==version);objectVersions.set(key.slice(13),left);if(!left.length)objects.delete(key);}
      else objects.delete(key);
      res.statusCode=204;res.end();return;
    }
    if(req.method==="POST"&&key==="/storage/v1/object/list/videos"){
      const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());
      const prefix=`/test-videos/${body.prefix}/`,entries=new Map<string,{name:string;id:string|null}>();
      for(const stored of objects.keys())if(stored.startsWith(prefix)){
        const rest=stored.slice(prefix.length),name=rest.split("/")[0];entries.set(name,{name,id:rest.includes("/")?null:"fixture"});
      }
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify([...entries.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(body.offset??0,(body.offset??0)+(body.limit??100))));return;
    }
    if(req.method==="DELETE"&&key==="/storage/v1/object/videos"){
      const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());
      for(const object of body.prefixes??[])objects.delete(`/test-videos/${object}`);
      res.setHeader("Content-Type","application/json");res.end("[]");return;
    }
    if(req.method==="GET"&&key==="/storage/v1/bucket/videos"){
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify({id:"videos",name:"videos",public:false}));return;
    }
    if(req.method==="POST"&&key.startsWith("/storage/v1/object/videos/")){
      for await(const chunk of req){void chunk;}
      res.statusCode=413;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({statusCode:"413",error:"PayloadTooLarge",message:"The object exceeded the maximum allowed size"}));return;
    }
    if(req.method==="POST"&&key.startsWith("/storage/v1/object/sign/videos/")){
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify({signedURL:`/object/sign/videos/${key.slice("/storage/v1/object/sign/videos/".length)}?token=fixture`}));return;
    }
    if(req.method==="POST"&&key.includes("accounts:lookup")){
      const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());const uid=body.localId?.[0];
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify({users:[{localId:uid,email:"fixture@example.test",emailVerified:true,validSince:"0",disabled:false}]}));return;
    }
    if(req.method==="PUT"){const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const bytes=Buffer.concat(chunks);objects.set(key,bytes);res.setHeader("ETag",'"'+createHash("md5").update(bytes).digest("hex")+'"');res.end();return;}
    const objectKey=key.startsWith("/storage/v1/object/sign/videos/")?`/test-videos/${key.slice("/storage/v1/object/sign/videos/".length)}`:key;
    const bytes=objects.get(objectKey);if(!bytes){res.statusCode=404;res.end();return;}res.setHeader("Content-Length",bytes.length);if(req.method==="HEAD")res.end();else res.end(bytes);
  });
  await new Promise<void>(resolve=>storage.listen(0,"127.0.0.1",resolve));process.env.S3_ENDPOINT_URL=`http://127.0.0.1:${(storage.address() as {port:number}).port}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST=`127.0.0.1:${(storage.address() as {port:number}).port}`;process.env.FIREBASE_ADMIN_PROJECT_ID="demo-animatube";
  prisma=(await import("../lib/prisma")).prisma;
  submissions=await import("../lib/generation/submission");
}, {timeout:60000});
after(async()=>{await prisma?.$disconnect();await server?.stop();await db?.close();await new Promise<void>(resolve=>storage?.close(()=>resolve()));if(workDir)await rm(workDir,{recursive:true,force:true});});
const config=()=>GenerationSchema.parse({prompt:"Explain how an electrical circuit works",approvalRequired:false,targetDuration:15,resolution:"720p"});
test("additive migrations preserve existing user credit balances",async()=>{
  const migrationDb=await PGlite.create();
  try{
    await migrationDb.exec(await readFile("prisma/migrations/20261010000000_initial/migration.sql","utf8"));
    await migrationDb.exec(`INSERT INTO "User" ("id","email","credits") VALUES ('legacy-fixture','legacy@example.test',17)`);
    await migrationDb.exec(await readFile("prisma/migrations/20261011120000_add_firebase_uid/migration.sql","utf8"));
    await migrationDb.exec(await readFile("prisma/migrations/20261013000000_resumable_generation/migration.sql","utf8"));
    await migrationDb.exec(await readFile("prisma/migrations/20261014000000_video_trash/migration.sql","utf8"));
    const result=await migrationDb.query<{credits:number}>(`SELECT "credits" FROM "User" WHERE "id"='legacy-fixture'`);
    assert.equal(result.rows[0].credits,17);
    const ledger=await migrationDb.query(`SELECT * FROM "CreditLedger"`);assert.equal(ledger.rows.length,0);
  }finally{await migrationDb.close();}
});
async function user(credits=5){return prisma.user.create({data:{email:`${crypto.randomUUID()}@example.test`,firebaseUid:crypto.randomUUID(),credits,emailVerified:new Date()}});}
test("concurrent submissions cannot overdraw credits and preserve outbox intent",async()=>{
  const account=await user(1);
  const results=await Promise.allSettled([submissions.createGeneration(account.id,config(),"parallel-a"),submissions.createGeneration(account.id,config(),"parallel-b")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,0);
  assert.equal(await prisma.jobOutbox.count({where:{jobId:{in:(await prisma.video.findMany({where:{userId:account.id}})).map(v=>v.jobId)}}}),1);
});
test("same request key creates only one video, debit and outbox",async()=>{
  const account=await user(2);const [a,b]=await Promise.all([submissions.createGeneration(account.id,config(),"same-request"),submissions.createGeneration(account.id,config(),"same-request")]);
  assert.equal(a.id,b.id);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,1);assert.equal(await prisma.creditLedger.count({where:{jobId:a.jobId}}),1);
  await assert.rejects(submissions.createGeneration(account.id,{...config(),prompt:"A completely different video prompt"},"same-request"),/different generation/);
});
test("refund and concurrent resume reserve at most one credit",async()=>{
  const account=await user(2);const video=await submissions.createGeneration(account.id,config(),"refund-resume");
  await prisma.video.update({where:{id:video.id},data:{renderStatus:"failed",status:"failed"}});
  await Promise.all([submissions.refundFailedGeneration(video.jobId,1),submissions.refundFailedGeneration(video.jobId,1)]);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,2);
  const attempts=await Promise.allSettled([submissions.scheduleResume(video.jobId,account.id),submissions.scheduleResume(video.jobId,account.id)]);
  assert.ok(attempts.some(r=>r.status==="fulfilled"));assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,1);
  assert.equal(await prisma.jobOutbox.count({where:{jobId:video.jobId}}),2);
});
test("another account cannot access or resume saved generation",async()=>{
  const owner=await user(),other=await user();const video=await submissions.createGeneration(owner.id,config(),"owned");
  const {ownedVideo}=await import("../lib/generation/access");await assert.rejects(ownedVideo(video.jobId,other.id),/not found/);await assert.rejects(submissions.scheduleResume(video.jobId,other.id),/not found/);
  const {POST}=await import("../app/api/jobs/[jobId]/resume/route");const response=await POST(new Request("http://localhost/api/resume",{method:"POST"}),{params:Promise.resolve({jobId:video.jobId})});assert.equal(response.status,401);
});
test("active lease rejects duplicate worker/manual resume; expired lease recovers",async()=>{
  const account=await user();const video=await submissions.createGeneration(account.id,config(),"lease");
  await prisma.video.update({where:{id:video.id},data:{renderStatus:"processing",executionToken:"old-worker",executionLease:new Date(Date.now()+60000)}});
  await assert.rejects(submissions.scheduleResume(video.jobId,account.id),/already running/);
  await prisma.video.update({where:{id:video.id},data:{executionLease:new Date(Date.now()-1000)}});const resumed=await submissions.scheduleResume(video.jobId,account.id);assert.equal(resumed.queueVersion,2);
});
test("cloud checkpoint verification rejects missing and changed object bytes",async()=>{
  const {uploadToS3}=await import("../lib/s3");
  const {describeArtifact,verifyCheckpointArtifact}=await import("../lib/generation/artifacts");
  const key="jobs/checksum-fixture/data.json";
  await uploadToS3(key,"original checkpoint bytes","application/json");
  const artifact=await describeArtifact({provider:"s3",key});
  assert.equal(await verifyCheckpointArtifact(artifact),true);
  await uploadToS3(key,"different checkpoint bytes","application/json");
  assert.equal(await verifyCheckpointArtifact(artifact),false);
  objects.delete(`/test-videos/${key}`);
  assert.equal(await verifyCheckpointArtifact(artifact),false);
});
test("late queue acceptance is deduplicated without speculative refunds",async()=>{
  await prisma.jobOutbox.deleteMany();const account=await user(2);const video=await submissions.createGeneration(account.id,config(),"late-queue");
  const {dispatchOutbox}=await import("../lib/generation/outbox");const accepted=new Set<string>();let fail=true;
  const transport={render:async(_payload:VideoJobData,id:string)=>{accepted.add(id);if(fail)throw new Error("Queue accepted the job but acknowledgment timed out");},upload:async()=>{}};
  await dispatchOutbox(10,transport);assert.equal((await prisma.jobOutbox.findUniqueOrThrow({where:{id:`${video.jobId}-render-1`}})).status,"pending");
  fail=false;await Promise.all([dispatchOutbox(10,transport),dispatchOutbox(10,transport)]);assert.equal(accepted.size,1);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,1);assert.equal((await prisma.jobOutbox.findUniqueOrThrow({where:{id:`${video.jobId}-render-1`}})).status,"sent");
});
test("real FFmpeg render resumes at assembly using saved script, speech and visuals",{timeout:120000},async()=>{
  const {uploadFileToS3,uploadToS3}=await import("../lib/s3");const {downloadAsset}=await import("../lib/assets");
  const ffmpeg=(await import("../lib/ffmpeg")).default;const {runFFmpeg}=await import("../lib/ffmpeg");
  const {processVideoJob}=await import("../lib/workers/video-worker");
  const {assembleCinematicVideo}=await import("../lib/stages/cinematic-assembly");
  const account=await user(3);const video=await submissions.createGeneration(account.id,config(),"render-resume");
  let scripts=0,voices=0,visuals=0,assemblies=0;
  const providers:Partial<VideoWorkerProviders>={progress:async()=>{},script:async id=>{
    scripts++;const scene={scene_id:1,narration:"An electric circuit carries current.",duration_seconds:2,emotion:"calm" as const,environment:"classroom",camera_direction:"static" as const,visual_prompt:"Circuit diagram",transition_type:"cut" as const,soundtrack_mood:"gentle emotional" as const,diagram:{title:"Electric circuit",items:["Battery","Wire","Bulb"]}};
    const script={title:"Circuit basics",description:"A test explainer",tags:["science"],scenes:[scene]};
    await uploadToS3(`jobs/${id}/cinematic-script.json`,JSON.stringify(script),"application/json");
    return {script,storyPlan:{total_duration:2,story_arc:{intro:{start:0,end:0.5},buildup:{start:0.5,end:1},climax:{start:1,end:1.5},resolution:{start:1.5,end:2}},scenes:[{scene:1,purpose:"Explain circuit",emotion:"calm",camera:"static",lighting:"bright",duration_seconds:2,narrative_beat:"hook"}],overall_mood:"clear",visual_style:"diagram"}};
  },voice:async(id,_segments,_voice,_log,options)=>{
    voices++;const audio=join(workDir,"voice.mp3");await runFFmpeg(ffmpeg().input("sine=frequency=440:duration=2").inputFormat("lavfi").audioCodec("libmp3lame").output(audio));
    const s3Key=`jobs/${id}/voice.mp3`;await uploadFileToS3(s3Key,audio,"audio/mpeg");
    const words=[{text:"An electric circuit",startTime:0.1,endTime:0.9,sceneIndex:0},{text:"carries current.",startTime:1,endTime:1.8,sceneIndex:0}];
    const scene={sceneIndex:0,inputHash:"fixture-speech",s3Key,durationSeconds:2,words};await options?.onSceneComplete?.(scene);
    return {s3Key,durationSeconds:2,sceneDurations:[2],words,sceneAssets:[scene]};
  },visuals:async(...args)=>{visuals++;return (await import("../lib/stages/cinematic-visuals")).fetchCinematicVisuals(...args);},assembly:async(...args)=>{assemblies++;if(assemblies===1)throw new Error("Injected assembly failure");return assembleCinematicVideo(...args);}};
  const job=(version:number)=>({data:{jobId:video.jobId,userId:account.id,queueVersion:version,renderRevision:1},attemptsMade:0,opts:{attempts:1}} as Job<VideoJobData>);
  await assert.rejects(processVideoJob(job(1),providers),/Injected assembly/);
  let saved=await prisma.video.findUniqueOrThrow({where:{id:video.id}});const manifest=readManifest(saved.generationManifest);assert.equal(manifest.stages.visuals?.status,"completed");assert.equal(saved.creditState,"refunded");
  await submissions.scheduleResume(video.jobId,account.id);await processVideoJob(job(2),providers);
  saved=await prisma.video.findUniqueOrThrow({where:{id:video.id}});assert.equal(saved.renderStatus,"completed");assert.deepEqual({scripts,voices,visuals,assemblies},{scripts:1,voices:1,visuals:1,assemblies:2});
  assert.equal(saved.creditState,"consumed");assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,2);
  const final=join(workDir,"verified-final.mp4");await downloadAsset({provider:saved.storageProvider as "s3",key:saved.s3Key!},final);
  const metadata=await new Promise<import("fluent-ffmpeg").FfprobeData>((resolve,reject)=>ffmpeg.ffprobe(final,(error,data)=>error?reject(error):resolve(data)));
  const stream=metadata.streams.find(s=>s.codec_type==="video");assert.equal(stream?.width,1280);assert.equal(stream?.height,720);assert.ok(metadata.streams.some(s=>s.codec_type==="audio"));assert.ok((await readFile(final)).length>1000);
  const captions=readManifest(saved.generationManifest).stages.captions?.output?.data as {srtKey:string};assert.ok(objects.get(`/test-videos/${captions.srtKey}`)?.toString().includes("00:00:00,100"));
  renderedId=saved.id;renderedUserId=saved.userId;
});
function token(uid:string){const now=Math.floor(Date.now()/1000);return Buffer.from(JSON.stringify({alg:"none",typ:"JWT"})).toString("base64url")+"."+Buffer.from(JSON.stringify({sub:uid,user_id:uid,aud:"demo-animatube",iss:"https://securetoken.google.com/demo-animatube",iat:now,exp:now+3600,auth_time:now,email:"fixture@example.test",email_verified:true,firebase:{identities:{},sign_in_provider:"password"}})).toString("base64url")+".";}
test("publishing retries reuse the exact cloud video and never run rendering",async()=>{
  const video=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});const before=JSON.stringify(video.scriptJson),key=video.s3Key;
  const {processUploadJob}=await import("../lib/workers/upload-worker");let attempts=0;
  const fakeUpload:typeof import("../lib/stages/upload").uploadToYouTube=async(jobId)=>{attempts++;if(attempts===1)throw new Error("Simulated YouTube outage");await prisma.video.update({where:{jobId},data:{youtubeId:"fixture-youtube",youtubeUrl:"https://www.youtube.com/watch?v=fixture-youtube",uploadStatus:"uploaded"}});return {youtubeId:"fixture-youtube",youtubeUrl:"https://www.youtube.com/watch?v=fixture-youtube"};};
  const data={jobId:video.jobId,userId:video.userId,asset:{provider:"s3" as const,key:video.s3Key!},title:video.title!,description:"",tags:[],visibility:"private",renderRevision:video.renderRevision};
  await assert.rejects(processUploadJob({data,attemptsMade:0,opts:{attempts:2}},fakeUpload),/Simulated/);
  assert.equal((await prisma.video.findUniqueOrThrow({where:{id:renderedId}})).renderStatus,"completed");
  await processUploadJob({data,attemptsMade:1,opts:{attempts:2}},fakeUpload);
  const saved=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});assert.equal(saved.s3Key,key);assert.equal(JSON.stringify(saved.scriptJson),before);assert.equal(saved.uploadStatus,"uploaded");
});
test("authenticated storyboard approval uses revision checks and queues the edited script",async()=>{
  const account=await prisma.user.findUniqueOrThrow({where:{id:renderedUserId}}),video=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});
  const headers={Authorization:`Bearer ${token(account.firebaseUid!)}`,"Content-Type":"application/json"};
  const api=await import("../app/api/storyboard/[jobId]/route");const context={params:Promise.resolve({jobId:video.jobId})};
  const response=await api.GET(new Request("http://localhost/storyboard",{headers}),context);assert.equal(response.status,200);const current=await response.json();
  current.storyboard.scenes[0].narration_preview="A revised explanation of a closed electrical circuit.";
  const body={storyboard:current.storyboard,expectedRevision:current.revision,approve:false};
  const draft=await api.POST(new Request("http://localhost/storyboard",{method:"POST",headers,body:JSON.stringify(body)}),context);assert.equal(draft.status,200);
  const stale=await api.POST(new Request("http://localhost/storyboard",{method:"POST",headers,body:JSON.stringify(body)}),context);assert.equal(stale.status,409);
  const saved=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});assert.equal(saved.renderStatus,"awaiting_approval");assert.equal(saved.youtubeId,null);assert.ok(saved.publicationHistory);
  const approve=await api.POST(new Request("http://localhost/storyboard",{method:"POST",headers,body:JSON.stringify({...body,expectedRevision:saved.renderRevision,approve:true,expectedAdditionalCredits:1})}),context);assert.equal(approve.status,200);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,account.credits-1);assert.equal(await prisma.creditLedger.count({where:{jobId:video.jobId,reason:"Render edited or regenerated video"}}),1);const queued=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});assert.equal(queued.approvedRevision,queued.renderRevision);assert.equal(queued.renderStatus,"queued");assert.ok(JSON.stringify(queued.scriptJson).includes("revised explanation"));
  const other=await user();const forbidden=await api.GET(new Request("http://localhost/storyboard",{headers:{Authorization:`Bearer ${token(other.firebaseUid!)}`}}),context);assert.equal(forbidden.status,404);
});
test("native vertical render supports Hindi captions, transitions, and music ducking",{timeout:120000},async()=>{
  const video=await prisma.video.findUniqueOrThrow({where:{id:renderedId}}),manifest=readManifest(video.generationManifest);
  const base=(manifest.stages.visuals!.output!.data as unknown as import("../lib/stages/cinematic-visuals").CinematicTimelineEntry[])[0];
  const voice=(manifest.stages.voice!.output!.data as {s3Key:string}).s3Key;
  const timeline=[0,1].map(index=>({...base,start_sec:index,end_sec:index+1,scene:{...base.scene,scene_id:index+1,duration_seconds:1,narration:index?"बिजली का प्रवाह":"बंद विद्युत परिपथ",camera_direction:"pan left" as const,transition_type:"fade" as const}}));
  const {assembleCinematicVideo}=await import("../lib/stages/cinematic-assembly"),{addCinematicSubtitles}=await import("../lib/stages/cinematic-subtitles"),{downloadAsset}=await import("../lib/assets"),{default:ffmpeg,runFFmpeg}=await import("../lib/ffmpeg");
  const settings={aspectRatio:"9:16" as const,resolution:"720p" as const,frameRate:24 as const,musicS3Key:voice,musicVolume:0.15};
  const raw=await assembleCinematicVideo("vertical-fixture",timeline,voice,workDir,undefined,settings);
  const finalKey=await addCinematicSubtitles("vertical-fixture",timeline.map(e=>e.scene),timeline,raw,workDir,{...settings,language:"hindi",words:[{text:"बंद विद्युत परिपथ",sceneIndex:0,startTime:0.1,endTime:0.8},{text:"बिजली का प्रवाह",sceneIndex:1,startTime:1.1,endTime:1.8}]});
  const final=join(workDir,"vertical.mp4");await downloadAsset({provider:"s3",key:finalKey},final);
  const metadata=await new Promise<import("fluent-ffmpeg").FfprobeData>((resolve,reject)=>ffmpeg.ffprobe(final,(error,data)=>error?reject(error):resolve(data)));
  const stream=metadata.streams.find(s=>s.codec_type==="video");assert.equal(stream?.width,720);assert.equal(stream?.height,1280);assert.ok(metadata.streams.some(s=>s.codec_type==="audio"));
  await mkdir("test-output/verification",{recursive:true});await copyFile(final,"test-output/verification/vertical-hindi.mp4");
  await runFFmpeg(ffmpeg(final).seekInput(0.5).frames(1).output("test-output/verification/vertical-hindi.png"));
});



test("Supabase signed playback, verification and streaming use the Supabase reader",async()=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL=process.env.S3_ENDPOINT_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-service-role-key";
  try{
    const {getAssetUrl,verifyAsset,openAssetStream}=await import("../lib/assets");
    const key="videos/supabase-fixture/final.mp4",bytes=Buffer.from("private video fixture");
    objects.set(`/test-videos/${key}`,bytes);
    const ref={provider:"supabase" as const,key};
    assert.match(await getAssetUrl(ref),/storage\/v1\/object\/sign\/videos/);
    assert.equal(await verifyAsset(ref),true);
    const chunks:Buffer[]=[];for await(const chunk of await openAssetStream(ref))chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks),bytes);
    objects.delete(`/test-videos/${key}`);assert.equal(await verifyAsset(ref),false);
  }finally{delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;}
});

test("channel references enforce ownership and are available to storyboard scenes",async()=>{
  const account=await prisma.user.findUniqueOrThrow({where:{id:renderedUserId}});
  const headers={Authorization:`Bearer ${token(account.firebaseUid!)}`,"Content-Type":"application/json"};
  const api=await import("../app/api/channels/route");
  const settings={approvedAssets:[{name:"Approved character portrait",key:`uploads/${account.id}/portrait.png`,type:"image"}]};
  const response=await api.POST(new Request("http://localhost/channels",{method:"POST",headers,body:JSON.stringify({name:"Science series",settings})}));
  assert.equal(response.status,201);const {channel}=await response.json();
  await prisma.video.update({where:{id:renderedId},data:{channelProfileId:channel.id}});
  const storyboard=await import("../app/api/storyboard/[jobId]/route");
  const video=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});
  const board=await storyboard.GET(new Request("http://localhost/storyboard",{headers}),{params:Promise.resolve({jobId:video.jobId})});
  assert.equal((await board.json()).approvedAssets[0].key,settings.approvedAssets[0].key);
  const denied=await api.POST(new Request("http://localhost/channels",{method:"POST",headers,body:JSON.stringify({name:"Invalid references",settings:{approvedAssets:[{name:"Other account",key:"uploads/other/private.png",type:"image"}]}})}));
  assert.equal(denied.status,422);
});

test("script retry reuses a persisted story plan after narration fails",async()=>{
  const original=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});
  const {storyPlanSchema,sceneScriptSchema}=await import("../lib/cinematic/schemas");
  const plan=storyPlanSchema.parse(original.storyPlan),script=sceneScriptSchema.parse(original.scriptJson);
  const {uploadToS3}=await import("../lib/s3");const {processVideoJob}=await import("../lib/workers/video-worker");
  const account=await user(3),video=await submissions.createGeneration(account.id,{...config(),approvalRequired:true},"plan-subcheckpoint");
  let planning=0,scripting=0,reused=0;
  const providers:Partial<VideoWorkerProviders>={progress:async()=>{},script:async(id,_topic,_style,_duration,_language,_log,options)=>{
    if(options?.savedStoryPlan){reused++;assert.deepEqual(options.savedStoryPlan,plan);}else{
      planning++;const key=`jobs/${id}/story-plan.json`;await uploadToS3(key,JSON.stringify(plan),"application/json");await options?.onStoryPlanComplete?.(plan,key);
    }
    if(++scripting===1)throw new Error("Injected narration failure after successful planning");
    await uploadToS3(`jobs/${id}/cinematic-script.json`,JSON.stringify(script),"application/json");return {storyPlan:plan,script};
  }};
  const job=(version:number)=>({data:{jobId:video.jobId,userId:account.id,queueVersion:version,renderRevision:1},attemptsMade:0,opts:{attempts:1}});
  await assert.rejects(processVideoJob(job(1),providers),/Injected narration/);
  const failed=await prisma.video.findUniqueOrThrow({where:{id:video.id}});assert.ok(readManifest(failed.generationManifest).scriptPlan);
  await submissions.scheduleResume(video.jobId,account.id);await processVideoJob(job(2),providers);
  assert.deepEqual({planning,scripting,reused},{planning:1,scripting:2,reused:1});
  assert.equal((await prisma.video.findUniqueOrThrow({where:{id:video.id}})).renderStatus,"awaiting_approval");
});

test("Supabase maximum-size rejection saves the existing render to S3",async()=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL=process.env.S3_ENDPOINT_URL;process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-service-role-key";
  try{
    const {downloadAsset,verifyAsset}=await import("../lib/assets");const {uploadFinalVideoToStorage}=await import("../lib/storage");
    const original=await prisma.video.findUniqueOrThrow({where:{id:renderedId}});
    const local=join(workDir,"storage-fallback-final.mp4");await downloadAsset({provider:"s3",key:original.s3Key!},local);
    const account=await user(),video=await submissions.createGeneration(account.id,config(),"storage-size-fallback");
    const result=await uploadFinalVideoToStorage(video.jobId,local,workDir);
    assert.equal(result.storageProvider,"s3");assert.equal(await verifyAsset({provider:"s3",key:result.videoS3Key}),true);
    const saved=await prisma.video.findUniqueOrThrow({where:{id:video.id}});assert.equal(saved.storageProvider,"s3");assert.equal(saved.s3Key,result.videoS3Key);
    assert.deepEqual(objects.get(`/test-videos/${result.videoS3Key}`),await readFile(local));
  }finally{delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;}
});

test("authenticated download streams exact video bytes with attachment headers",async()=>{
  process.env.ENCRYPTION_KEY="ab".repeat(32);
  const owner=await user(),created=await submissions.createGeneration(owner.id,config(),"download-stream-fixture");
  const key=`jobs/${created.jobId}/final_video.mp4`;const {uploadToS3}=await import("../lib/s3");
  await uploadToS3(key,Buffer.from("private MP4 streaming fixture"),"video/mp4");
  const video=await prisma.video.update({where:{id:created.id},data:{renderStatus:"completed",storageProvider:"s3",s3Key:key}});
  const account=await prisma.user.findUniqueOrThrow({where:{id:video.userId}}),{NextRequest}=await import("next/server");
  const metadata=await import("../app/api/download/[id]/route"),file=await import("../app/api/download/[id]/file/route");
  const context={params:Promise.resolve({id:video.id})};
  const response=await metadata.GET(new NextRequest("http://localhost/api/download",{headers:{Authorization:`Bearer ${token(account.firebaseUid!)}`}}),context);
  assert.equal(response.status,200);const result=await response.json();assert.match(result.url,/^\/api\/download\/.+\/file\?ticket=/);
  const streamed=await file.GET(new NextRequest(`http://localhost${result.url}`),context);
  assert.equal(streamed.status,200);assert.match(streamed.headers.get("content-disposition")!,/^attachment;/);
  assert.deepEqual(Buffer.from(await streamed.arrayBuffer()),objects.get(`/test-videos/${video.s3Key}`));
  const tampered=await file.GET(new NextRequest("http://localhost/download?ticket=invalid"),context);assert.equal(tampered.status,410);
  const storedKey=`/test-videos/${video.s3Key}`,storedBytes=objects.get(storedKey)!;objects.delete(storedKey);
  const missing=await metadata.GET(new NextRequest("http://localhost/download",{headers:{Authorization:`Bearer ${token(account.firebaseUid!)}`}}),context);assert.equal(missing.status,404);objects.set(storedKey,storedBytes);
  const other=await user();const denied=await metadata.GET(new NextRequest("http://localhost/download",{headers:{Authorization:`Bearer ${token(other.firebaseUid!)}`}}),context);assert.equal(denied.status,404);

});



test("delete and restore enforce ownership, revoke access, preserve credits and hide videos",async()=>{
  process.env.ENCRYPTION_KEY="ab".repeat(32);
  const account=await user(5),other=await user(),created=await submissions.createGeneration(account.id,config(),"trash-fixture");
  const key=`jobs/${created.jobId}/final_video.mp4`;const {uploadToS3}=await import("../lib/s3");await uploadToS3(key,"private video","video/mp4");
  const video=await prisma.video.update({where:{id:created.id},data:{renderStatus:"completed",storageProvider:"s3",s3Key:key,creditState:"consumed"}});
  const api=await import("../app/api/projects/[id]/route"),dashboard=await import("../app/api/dashboard/route");
  const headers={Authorization:`Bearer ${token(account.firebaseUid!)}`,"Content-Type":"application/json"},context={params:Promise.resolve({id:video.id})};
  const {createDownloadTicket}=await import("../lib/download-ticket"),{NextRequest}=await import("next/server"),file=await import("../app/api/download/[id]/file/route");
  const ticket=createDownloadTicket(account.id,video.id,video.renderRevision),balance=(await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits;
  const denied=await api.DELETE(new Request("http://localhost/project",{method:"DELETE",headers:{Authorization:`Bearer ${token(other.firebaseUid!)}`}}),context);assert.equal(denied.status,404);
  assert.equal((await api.DELETE(new Request("http://localhost/project",{method:"DELETE",headers}),context)).status,200);
  assert.equal((await api.DELETE(new Request("http://localhost/project",{method:"DELETE",headers}),context)).status,200);
  const active=await dashboard.GET(new Request("http://localhost/api/dashboard",{headers}));assert.equal((await active.json()).videos.length,0);
  const trash=await dashboard.GET(new Request("http://localhost/api/dashboard?trash=1",{headers}));assert.equal((await trash.json()).videos[0].id,video.id);
  assert.equal((await file.GET(new NextRequest(`http://localhost/download?ticket=${encodeURIComponent(ticket)}`),context)).status,404);
  await assert.rejects(submissions.scheduleResume(video.jobId,account.id),/not found/);
  await assert.rejects(submissions.createGeneration(account.id,config(),"trash-fixture"),/in Trash/);
  const deniedRestore=await api.PATCH(new Request("http://localhost/project",{method:"PATCH",headers:{Authorization:`Bearer ${token(other.firebaseUid!)}`,"Content-Type":"application/json"},body:JSON.stringify({action:"restore"})}),context);assert.equal(deniedRestore.status,404);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,balance);
  assert.ok(objects.has(`/test-videos/${key}`));
  const restore=await api.PATCH(new Request("http://localhost/project",{method:"PATCH",headers,body:JSON.stringify({action:"restore"})}),context);assert.equal(restore.status,200);
  const restored=await dashboard.GET(new Request("http://localhost/api/dashboard",{headers}));assert.equal((await restored.json()).videos[0].id,video.id);
});
test("active generation and uploads cannot be deleted",async()=>{
  const account=await user(),video=await submissions.createGeneration(account.id,config(),"trash-active");
  const {moveVideoToTrash}=await import("../lib/generation/library");
  await assert.rejects(moveVideoToTrash(video.id,account.id),/generating or uploading/);
  await prisma.video.update({where:{id:video.id},data:{renderStatus:"completed",uploadStatus:"uploading"}});
  await assert.rejects(moveVideoToTrash(video.id,account.id),/generating or uploading/);
  assert.equal((await prisma.video.findUniqueOrThrow({where:{id:video.id}})).deletedAt,null);
});
test("stale queue deliveries cannot generate a trashed pending video",async()=>{
  const account=await user(),video=await submissions.createGeneration(account.id,config(),"trashed-worker");
  await prisma.video.update({where:{id:video.id},data:{renderStatus:"pending"}});
  const {moveVideoToTrash}=await import("../lib/generation/library");await moveVideoToTrash(video.id,account.id);
  const {processVideoJob}=await import("../lib/workers/video-worker");let calls=0;
  await processVideoJob({data:{jobId:video.jobId,userId:account.id,queueVersion:1,renderRevision:1},attemptsMade:0,opts:{attempts:1}},{script:async()=>{calls++;throw new Error("Trashed job must never run");}});
  assert.equal(calls,0);assert.equal((await prisma.video.findUniqueOrThrow({where:{id:video.id}})).renderStatus,"pending");
});

async function deletionFixture(){
  const account=await user(),created=await submissions.createGeneration(account.id,config(),crypto.randomUUID());
  const key=`videos/${created.jobId}/attempt/final.mp4`;
  objects.set(`/test-videos/${key}`,Buffer.from("private generated video"));
  const video=await prisma.video.update({where:{id:created.id},data:{renderStatus:"completed",status:"completed",storageProvider:"s3",s3Key:key,creditState:"consumed"}});
  return {account,video,key};
}

test("permanent deletion requires confirmation, ownership and Trash; deletes orphan cloud files and preserves credits",async()=>{
  const {account,video,key}=await deletionFixture(),other=await user();
  const api=await import("../app/api/projects/[id]/delete-permanently/route"),{moveVideoToTrash}=await import("../lib/generation/library");
  const context={params:Promise.resolve({id:video.id})};
  const request=(uid:string,confirm=true)=>new Request("http://localhost/delete-permanently",{method:"DELETE",headers:{Authorization:`Bearer ${token(uid)}`,"Content-Type":"application/json"},body:JSON.stringify({confirm})});
  assert.equal((await api.DELETE(new Request("http://localhost/delete-permanently",{method:"DELETE",body:'{"confirm":true}'}),context)).status,401);
  assert.equal((await api.DELETE(request(account.firebaseUid!,false),context)).status,422);
  assert.equal((await api.DELETE(request(other.firebaseUid!),context)).status,404);
  assert.equal((await api.DELETE(request(account.firebaseUid!),context)).status,409);
  const orphan=`jobs/${video.jobId}_r1_a1_fixture/voice/old.wav`,legacy=`jobs/${video.jobId}/captions.srt`,neighbor=`jobs/${video.jobId}other_r1_a1_fixture/keep.mp4`;
  for(const k of [orphan,legacy,neighbor])objects.set(`/test-videos/${k}`,Buffer.from("fixture"));
  objectVersions.set(key,["version-1","version-2"]);
  const retired=`jobs/${video.jobId}_r1_a1_fixture/retired.mp4`,backup=`${key}-backup`;
  objectVersions.set(retired,["retired-version"]);objectVersions.set(backup,["keep-version"]);
  const balance=(await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits;
  await moveVideoToTrash(video.id,account.id);
  const response=await api.DELETE(request(account.firebaseUid!),context);assert.equal(response.status,200);assert.equal((await response.json()).deleted,true);
  for(const k of [key,orphan,legacy])assert.equal(objects.has(`/test-videos/${k}`),false,k);
  assert.deepEqual(objectVersions.get(key),[]);assert.ok(objects.has(`/test-videos/${neighbor}`));
  assert.deepEqual(objectVersions.get(retired),[]);assert.deepEqual(objectVersions.get(backup),[]);
  assert.equal(await prisma.video.findUnique({where:{id:video.id}}),null);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).credits,balance);
  assert.equal(await prisma.creditLedger.count({where:{jobId:video.jobId}}),1);
  const {processVideoJob}=await import("../lib/workers/video-worker"),{processUploadJob}=await import("../lib/workers/upload-worker");
  await processVideoJob({data:{jobId:video.jobId,userId:account.id},attemptsMade:0,opts:{attempts:1}},{script:async()=>{throw new Error("Deleted job must not run");}});
  await processUploadJob({data:{jobId:video.jobId,userId:account.id,title:"",description:"",tags:[],visibility:"private",asset:{provider:"s3",key}},attemptsMade:0,opts:{attempts:1}},async()=>{throw new Error("Deleted job must not upload");});
});

test("cloud deletion failure stays recoverable by durable retry, blocks restore, and survives worker handoff",async()=>{
  const {account,video,key}=await deletionFixture(),{moveVideoToTrash,restoreVideo}=await import("../lib/generation/library");
  const {requestPermanentDeletion}=await import("../lib/generation/permanent-deletion");
  const orphan=`jobs/${video.jobId}/old-voice.wav`;objects.set(`/test-videos/${orphan}`,Buffer.from("old voice"));
  await moveVideoToTrash(video.id,account.id);deletionFailures.add(`/test-videos/${orphan}`);
  const result=await requestPermanentDeletion(video.id,account.id);assert.equal(result.pending,true);
  assert.equal(objects.has(`/test-videos/${key}`),false);assert.ok(objects.has(`/test-videos/${orphan}`));assert.equal((await prisma.video.findUniqueOrThrow({where:{id:video.id}})).renderStatus,"deleting");
  await assert.rejects(restoreVideo(video.id,account.id),/cannot be undone/);
  deletionFailures.delete(`/test-videos/${orphan}`);
  await prisma.jobOutbox.update({where:{id:`${video.jobId}-purge`},data:{leaseUntil:new Date(Date.now()-1000)}});
  const {dispatchOutbox}=await import("../lib/generation/outbox");
  await dispatchOutbox(100,{render:async()=>{},upload:async()=>{}});
  assert.equal(await prisma.video.findUnique({where:{id:video.id}}),null);assert.equal(objects.has(`/test-videos/${key}`),false);
  assert.equal(objects.has(`/test-videos/${orphan}`),false);
});

test("shared source clips survive permanent deletion until the final consumer releases them",async()=>{
  const {account,video,key}=await deletionFixture(),{moveVideoToTrash}=await import("../lib/generation/library");
  const {requestPermanentDeletion,processPermanentDeletion}=await import("../lib/generation/permanent-deletion");
  const shared=`jobs/${video.jobId}_r1_a1_fixture/scene.jpg`;objects.set(`/test-videos/${shared}`,Buffer.from("shared scene"));
  const consumer=await prisma.video.create({data:{userId:account.id,jobId:`job_${crypto.randomUUID()}`,prompt:"consumer",style:"educational",duration:"short",voice:"ai_narrator",language:"english",tags:[],scriptJson:{scenes:[{visual_asset:{provider:"s3",s3Key:shared}}]}}});
  await moveVideoToTrash(video.id,account.id);
  const result=await requestPermanentDeletion(video.id,account.id);assert.equal(result.deleted,true);assert.equal(result.sharedAssets,1);
  assert.ok(objects.has(`/test-videos/${shared}`));assert.equal(objects.has(`/test-videos/${key}`),false);
  await prisma.video.delete({where:{id:consumer.id}});
  await processPermanentDeletion(`${video.jobId}-purge`,true);
  assert.equal(objects.has(`/test-videos/${shared}`),false);
});

test("Supabase final videos, nested accessories and dedicated thumbnails are removed; reusable uploads stay",async()=>{
  const {account,video,key}=await deletionFixture();
  process.env.NEXT_PUBLIC_SUPABASE_URL=process.env.S3_ENDPOINT_URL;process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-service-role";
  const accessory=`videos/${video.jobId}/attempt/subtitles.ass`,thumbnail=`uploads/${account.id}/thumbnails/generated.png`,uploaded=`uploads/${account.id}/references/source.png`;
  for(const k of [accessory,thumbnail,uploaded])objects.set(`/test-videos/${k}`,Buffer.from("fixture"));
  await prisma.video.update({where:{id:video.id},data:{storageProvider:"supabase",thumbnailKey:thumbnail,generationOptions:{...config(),musicAsset:{provider:"s3",key:uploaded,licensed:true}}}});
  const {moveVideoToTrash}=await import("../lib/generation/library"),{requestPermanentDeletion}=await import("../lib/generation/permanent-deletion");
  await moveVideoToTrash(video.id,account.id);assert.equal((await requestPermanentDeletion(video.id,account.id)).deleted,true);
  for(const k of [key,accessory,thumbnail])assert.equal(objects.has(`/test-videos/${k}`),false,k);
  assert.ok(objects.has(`/test-videos/${uploaded}`));
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("unfinished translations protect the original storyboard from permanent deletion",async()=>{
  const {account,video}=await deletionFixture();
  await submissions.createGeneration(account.id,{...config(),parentVideoId:video.id,variantKind:"translation"},crypto.randomUUID());
  const {moveVideoToTrash}=await import("../lib/generation/library"),{requestPermanentDeletion}=await import("../lib/generation/permanent-deletion");
  await moveVideoToTrash(video.id,account.id);
  await assert.rejects(requestPermanentDeletion(video.id,account.id),/translation still needs/);
  assert.equal((await prisma.video.findUniqueOrThrow({where:{id:video.id}})).renderStatus,"completed");
  await assert.rejects(submissions.createGeneration(account.id,{...config(),parentVideoId:video.id,variantKind:"translation"},crypto.randomUUID()),/Parent video not found/);
});

test("S3 permanent deletion removes only exact-key versions and leaves similarly named objects alone",async()=>{
  const key="version-deletion-fixture.mp4",neighbor=`${key}-backup`;
  objects.set(`/test-videos/${key}`,Buffer.from("target"));objects.set(`/test-videos/${neighbor}`,Buffer.from("unrelated"));
  objectVersions.set(key,["old","current"]);objectVersions.set(neighbor,["keep"]);
  const {deleteS3Permanently}=await import("../lib/s3");await deleteS3Permanently(key);
  assert.deepEqual(objectVersions.get(key),[]);assert.deepEqual(objectVersions.get(neighbor),["keep"]);
  assert.equal(objects.has(`/test-videos/${key}`),false);assert.ok(objects.has(`/test-videos/${neighbor}`));
});
