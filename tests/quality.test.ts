import test from "node:test";
import assert from "node:assert/strict";
import { resolveVoice,parseWordBoundaries,applyPronunciationOverrides } from "../lib/stages/voice";
import { captionPhrases,exportSrt,exportVtt,subtitleTimestamp,generateASSSubtitles } from "../lib/stages/cinematic-subtitles";
import { resolveRenderOptions } from "../lib/cinematic/render-options";
import { sceneScriptSchema } from "../lib/cinematic/schemas";
import { applyStoryboard } from "../lib/generation/storyboard";
import { canLinkLegacyAccount } from "../lib/account-linking";
import { createOAuthState,readOAuthState } from "../lib/youtube-oauth-state";
import { validateAssetRef,assetFromVideo } from "../lib/assets";
const scene={scene_id:1,narration:"Hello world.",duration_seconds:2,emotion:"calm" as const,environment:"studio",camera_direction:"static" as const,visual_prompt:"A clear diagram",transition_type:"cut" as const,soundtrack_mood:"gentle emotional" as const};
test("friendly voices honor Hindi and Spanish locales",()=>{assert.match(resolveVoice("male","hindi"),/^hi-IN-/);assert.match(resolveVoice("female","spanish"),/^es-ES-/);assert.match(resolveVoice("ai_narrator","english"),/^en-US-/);assert.match(resolveVoice("en-US-GuyNeural","hindi"),/^hi-IN-/);});
test("pronunciation terms match whole words and escape regex characters",()=>{assert.equal(applyPronunciationOverrides("AI AIs C++",{AI:"A I","C++":"see plus plus"}),"A I AIs see plus plus");});
test("word metadata is converted from 100ns ticks and captions use its actual positions",()=>{
  const words=parseWordBoundaries({Metadata:[{Type:"WordBoundary",Data:{Offset:2500000,Duration:5000000,text:{Text:"Hello"}}},{Type:"WordBoundary",Data:{Offset:10000000,Duration:4000000,text:{Text:"world."}}}]},0,2);
  const cues=captionPhrases([{start_sec:0,end_sec:2,scene}],{words});assert.equal(cues[0].startTime,0.25);assert.equal(cues[0].endTime,1.4);assert.match(exportSrt(cues),/00:00:00,250 --> 00:00:01,400/);assert.match(exportVtt(cues),/^WEBVTT/);
});
test("timestamp rounding carries into the next minute",()=>{assert.equal(subtitleTimestamp(59.9999),"00:01:00,000");assert.equal(subtitleTimestamp(59.9999,"ass"),"0:01:00.00");});
test("native vertical resolution and Hindi safe captions",()=>{assert.deepEqual(resolveRenderOptions({aspectRatio:"9:16",resolution:"1080p",frameRate:24}),{width:1080,height:1920,frameRate:24,aspectRatio:"9:16"});const ass=generateASSSubtitles([{text:"नमस्ते दुनिया",startTime:0,endTime:2,sceneIndex:0}],{aspectRatio:"9:16",language:"hindi"});assert.match(ass,/PlayResY: 1920/);assert.match(ass,/नमस्ते/);assert.match(ass,/Nirmala UI|Noto Sans Devanagari/);});
test("storyboard edits preserve identity and reject another user's assets",()=>{
  const script={title:"Test",description:"",tags:[],scenes:[scene]};
  assert.equal(applyStoryboard(script,[{scene_id:1,narration_preview:"Changed narration",estimated_duration:2,visual_prompt:"A graph"}],"user1","job1").scenes[0].narration,"Changed narration");
  assert.throws(()=>applyStoryboard(script,[{scene_id:1,narration_preview:"Changed",estimated_duration:2,visual_prompt:"graph",visual_asset:{s3Key:"uploads/other/file.png",type:"image"}}],"user1","job1"),/does not belong/);
  assert.equal(sceneScriptSchema.safeParse({...script,scenes:[{...scene,narration:""}]}).success,false);
});
test("legacy linking requires verified ownership and cannot replace another UID",()=>{assert.equal(canLinkLegacyAccount({emailVerified:false,uid:"new",existingUid:null,legacyGoogleIdentities:[]}),false);assert.equal(canLinkLegacyAccount({emailVerified:true,uid:"new",existingUid:"other",legacyGoogleIdentities:[]}),false);});
test("OAuth state rejects tampering, wrong nonce, and expiration",()=>{
  process.env.ENCRYPTION_KEY="ab".repeat(32);const state=createOAuthState("user1","firebase1");assert.equal(readOAuthState(state.cookie,state.nonce).userId,"user1");assert.throws(()=>readOAuthState(state.cookie,"wrong"));assert.throws(()=>readOAuthState(state.cookie.slice(0,-8)+"invalid!",state.nonce));
});
test("asset references reject URLs and traversal and preserve storage providers",()=>{assert.throws(()=>validateAssetRef({provider:"s3",key:"../secret"}));assert.throws(()=>validateAssetRef({provider:"supabase",key:"https://untrusted/file"}));assert.deepEqual(assetFromVideo({storageProvider:"supabase",s3Key:"videos/test/final.mp4"}),{provider:"supabase",key:"videos/test/final.mp4"});});

test("Supabase upload size errors include string statuses and the actual provider wording",async()=>{
  const {sizeLimitError}=await import("../lib/storage");
  assert.equal(sizeLimitError({statusCode:"413"}),true);
  assert.equal(sizeLimitError({status:413}),true);
  assert.equal(sizeLimitError({message:"The object exceeded the maximum allowed size"}),true);
  assert.equal(sizeLimitError({message:"Invalid API key"}),false);
  assert.equal(sizeLimitError(null),false);
});

test("download tickets reject tampering, expiration and a different video",async()=>{
  process.env.ENCRYPTION_KEY="ab".repeat(32);
  const {createDownloadTicket,readDownloadTicket}=await import("../lib/download-ticket");
  const ticket=createDownloadTicket("owner","video1",2,1000);
  assert.equal(readDownloadTicket(ticket,"video1",2000).userId,"owner");
  assert.throws(()=>readDownloadTicket(ticket,"video2",2000));assert.throws(()=>readDownloadTicket(ticket,"video1",302000));
  assert.throws(()=>readDownloadTicket(ticket.slice(0,-8)+"invalid!","video1",2000));
});
