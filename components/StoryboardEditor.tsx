"use client";
import { useCallback,useEffect,useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { useAuth } from "./auth/AuthProvider";
import type { CinematicScene } from "@/lib/types/cinematic";

interface Scene extends CinematicScene {
  narration_preview:string;estimated_duration:number;camera_notes?:string;
  thumbnail_url?:string;visual_url?:string;audio_url?:string;placeholder?:boolean;
}
interface Source {id:string;title:string;text:string;url?:string}
interface Board {scenes:Scene[];title?:string;description?:string;tags?:string[]}
interface ResponseData {storyboard:Board;revision:number;approvedRevision?:number|null;additionalCredits?:number;sources?:Source[];approvedAssets?:{name:string;key:string;type:"image"|"clip"}[]}
const inputClass="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 p-2 text-sm text-zinc-200";
export function StoryboardEditor({jobId,editable,onSaved}:{jobId:string;editable:boolean;onSaved:()=>void}){
  const {user}=useAuth();
  const [data,setData]=useState<ResponseData|null>(null),[board,setBoard]=useState<Board|null>(null);
  const [sources,setSources]=useState<Source[]>([]),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [findText,setFindText]=useState(""),[replacement,setReplacement]=useState("");
  const load=useCallback(async()=>{
    if(!user)return;
    try{
      const token=await user.getIdToken(),response=await fetch(`/api/storyboard/${encodeURIComponent(jobId)}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"Unable to load storyboard");
      setData(result);setBoard(result.storyboard);setSources(result.sources??[]);setDirty(false);setError(null);
    }catch(error){setError(error instanceof Error?error.message:"Unable to load storyboard");}
  },[jobId,user]);
  useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
  function update(index:number,values:Partial<Scene>){setBoard(current=>current?{...current,scenes:current.scenes.map((scene,i)=>i===index?{...scene,...values}:scene)}:current);setDirty(true);}
  function move(index:number,direction:number){if(!board)return;const scenes=[...board.scenes];if(direction===0)scenes.splice(index,1);else [scenes[index],scenes[index+direction]]=[scenes[index+direction],scenes[index]];setBoard({...board,scenes});setDirty(true);}
  async function save(approve:boolean,regenerate?:{sceneId:number;kind:"voice"|"visual"}){
    if(!user||!data||!board||busy)return;setBusy(true);
    try{
      const token=await user.getIdToken();const response=await fetch(`/api/storyboard/${encodeURIComponent(jobId)}`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({storyboard:board,sources,title:board.title,description:board.description,tags:board.tags,approve,expectedRevision:data.revision,expectedAdditionalCredits:data.additionalCredits??0,regenerateSceneId:regenerate?.sceneId,regenerateKind:regenerate?.kind})});
      const result=await response.json();if(!response.ok)throw new Error(response.status===409?"Generation or this revision changed. Your edits remain here; reload the saved revision before continuing.":result.error??"Unable to save storyboard");
      toast.success(approve?"Approved revision queued. Valid saved assets will be reused.":"Storyboard draft saved");await load();onSaved();
    }catch(error){setError(error instanceof Error?error.message:"Unable to save storyboard");}finally{setBusy(false);}
  }
  async function upload(index:number,file?:File){
    if(!file||!user)return;setBusy(true);
    try{const token=await user.getIdToken(),body=new FormData();body.set("file",file);const response=await fetch("/api/assets",{method:"POST",headers:{Authorization:`Bearer ${token}`},body}),result=await response.json();if(!response.ok)throw new Error(result.error);update(index,{visual_asset:result.asset,diagram:undefined});toast.success("Visual uploaded. Save or approve the scene to use it.");}catch(error){setError(error instanceof Error?error.message:"Upload failed");}finally{setBusy(false);}
  }
  function correct(){
    if(!findText||!replacement||!board)return;const replace=(text:string)=>text.replaceAll(findText,replacement);
    setBoard({...board,scenes:board.scenes.map(scene=>({...scene,narration_preview:replace(scene.narration_preview),visual_prompt:replace(scene.visual_prompt),caption:scene.caption===undefined?undefined:replace(scene.caption),diagram:scene.diagram?{title:replace(scene.diagram.title),items:scene.diagram.items.map(replace)}:undefined}))});setDirty(true);toast.success("Correction applied to narration, captions, and diagrams. Review supporting source passages before approval.");
  }
  if(!data||!board)return <section aria-label="Storyboard editor" className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">{error?<><p role="alert" className="text-sm text-red-300">{error}</p><button onClick={()=>void load()} className="mt-3 rounded border border-zinc-700 px-3 py-2 text-sm text-white">Retry loading storyboard</button></>:<p role="status" className="text-sm text-zinc-300">Loading your saved storyboard…</p>}</section>;
  return <section aria-label="Storyboard editor" className="mt-6 space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
    <div><h2 className="text-lg font-semibold text-white">Review your storyboard</h2><p className="mt-1 text-sm text-zinc-400">Revision {data.revision} · {data.approvedRevision===data.revision?"Approved":"Awaiting approval"} · {board.scenes.length} scenes</p><p className="mt-2 text-xs text-zinc-400">Edit narration and visual direction before rendering. Valid unchanged assets are reused. Approval costs {data.additionalCredits??0} additional credits{data.additionalCredits?" for a new render or re-reservation after a refund":""}.</p></div>
    {editable&&<div className="flex flex-wrap items-center gap-3"><button disabled={busy||data.approvedRevision===data.revision&&!dirty} onClick={()=>void save(true)} className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy?"Saving…":`Approve and render${data.additionalCredits?" · 1 credit":""}`}</button><p className="text-xs text-zinc-400">Review the scenes below before approving. Rendering continues automatically after approval.</p></div>}
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
    {!editable&&<p className="rounded bg-amber-950/30 p-3 text-sm text-amber-200">Generation is running. Editing becomes available when it pauses or finishes.</p>}
    <fieldset disabled={!editable||busy} className="space-y-3">
      <legend className="text-sm text-violet-300">Publishing metadata</legend>
      <label className="block text-xs text-zinc-400">Title<input value={board.title??""} maxLength={200} onChange={event=>{setBoard({...board,title:event.target.value});setDirty(true);}} className={inputClass}/></label>
      <label className="block text-xs text-zinc-400">Description<textarea value={board.description??""} maxLength={5000} onChange={event=>{setBoard({...board,description:event.target.value});setDirty(true);}} className={inputClass}/></label>
      <label className="block text-xs text-zinc-400">Tags (comma separated)<input key={data.revision} defaultValue={board.tags?.join(", ")??""} onBlur={event=>{setBoard({...board,tags:event.target.value.split(",").map(tag=>tag.trim()).filter(Boolean)});setDirty(true);}} className={inputClass}/></label>
    </fieldset>
    <details className="rounded border border-zinc-800 p-3"><summary className="cursor-pointer text-sm text-zinc-300">Sources and factual corrections</summary><div className="mt-3 space-y-3">
      {sources.map((source,index)=><label key={source.id} className="block text-xs text-zinc-400">{source.title} · {source.id}<textarea disabled={!editable||busy} value={source.text} rows={4} maxLength={30000} onChange={event=>{setSources(sources.map((s,i)=>i===index?{...s,text:event.target.value}:s));setDirty(true);}} className={inputClass}/></label>)}
      <p className="text-xs text-zinc-500">Source references assist review; they do not guarantee factual accuracy. Review dependent narration and citations when changing a source.</p>
      <input aria-label="Statement to correct" value={findText} onChange={event=>setFindText(event.target.value)} placeholder="Existing statement" className={inputClass}/><input aria-label="Corrected statement" value={replacement} onChange={event=>setReplacement(event.target.value)} placeholder="Approved correction" className={inputClass}/><button disabled={!editable||busy||!findText||!replacement} onClick={correct} className="rounded border border-zinc-700 px-3 py-2 text-sm disabled:opacity-40">Apply correction across scenes</button>
    </div></details>
    {board.scenes.map((scene,index)=><fieldset key={scene.scene_id} disabled={!editable||busy} className="space-y-3 rounded-lg border border-zinc-800 p-3 disabled:opacity-60">
      <legend className="px-2 text-sm text-violet-300">Scene {index+1}</legend>
      {scene.thumbnail_url&&<Image src={scene.thumbnail_url} alt={`Scene ${index+1} preview`} width={640} height={360} unoptimized className="max-h-52 w-full rounded object-contain"/>}
      {scene.visual_url&&<video src={scene.visual_url} controls preload="metadata" className="max-h-52 w-full rounded" aria-label={`Scene ${index+1} visual preview`}/>}
      {scene.audio_url&&<audio src={scene.audio_url} controls preload="none" className="w-full" aria-label={`Scene ${index+1} voice preview`}/>}
      {scene.placeholder&&<p className="text-sm text-amber-300">This scene uses a placeholder. Replace it with your own media, a diagram, or a better footage description.</p>}
      <label className="block text-xs text-zinc-400">Narration<textarea value={scene.narration_preview} rows={3} onChange={event=>update(index,{narration_preview:event.target.value})} className={inputClass}/></label>
      <label className="block text-xs text-zinc-400">Visual description / footage search<textarea value={scene.visual_prompt} rows={2} onChange={event=>update(index,{visual_prompt:event.target.value})} className={inputClass}/></label>
      {!!data.approvedAssets?.length&&<label className="block text-xs text-zinc-400">Approved channel media<select value={scene.visual_asset?.s3Key??""} onChange={event=>{const asset=data.approvedAssets?.find(a=>a.key===event.target.value);if(asset)update(index,{visual_asset:{s3Key:asset.key,type:asset.type,provider:"s3"},diagram:undefined});}} className={inputClass}><option value="">Select a saved reference</option>{data.approvedAssets.map(asset=><option key={asset.key} value={asset.key}>{asset.name}</option>)}</select></label>}
      <label className="block text-xs text-zinc-400">Replace visual (PNG, JPEG, WebP, MP4; under 24 MB)<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4" onChange={event=>void upload(index,event.target.files?.[0])} className="mt-1 block w-full"/></label>
      {(scene.visual_asset||scene.diagram)&&<button onClick={()=>update(index,{visual_asset:undefined,diagram:undefined})} className="text-xs text-violet-300 underline">Use footage search instead</button>}
      <details className="text-xs text-zinc-400"><summary className="cursor-pointer">Create a diagram</summary><input value={scene.diagram?.title??""} placeholder="Diagram heading" onChange={event=>update(index,{diagram:{title:event.target.value,items:scene.diagram?.items??["First item"]},visual_asset:undefined})} className={inputClass}/><textarea key={data.revision} rows={3} defaultValue={scene.diagram?.items.join("\n")??""} placeholder="One item per line (up to 8)" onBlur={event=>{const items=event.target.value.split("\n").map(item=>item.trim()).filter(Boolean).slice(0,8);if(items.length)update(index,{diagram:{title:scene.diagram?.title||"Diagram",items},visual_asset:undefined});}} className={inputClass}/></details>
      <label className="block text-xs text-zinc-400">Caption override (optional; shown for the measured scene)<textarea value={scene.caption??""} rows={2} placeholder="Use spoken narration captions" onChange={event=>update(index,{caption:event.target.value||undefined})} className={inputClass}/></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Target duration (seconds)<input type="number" min={1} max={120} step={0.1} value={scene.estimated_duration} onChange={event=>update(index,{estimated_duration:Number(event.target.value)})} className={inputClass}/></label><label className="text-xs text-zinc-400">Camera<select value={scene.camera_notes??"static"} onChange={event=>update(index,{camera_notes:event.target.value})} className={inputClass}>{["static","slow dolly forward","slow dolly backward","pan left","pan right","slow zoom in","slow zoom out","crane up","crane down","orbit","handheld shake"].map(camera=><option key={camera} value={camera}>{camera}</option>)}</select></label></div>
      <div className="space-y-2 text-xs text-zinc-400"><p>{scene.source_references?.length?"Review supporting source passage":"Unsupported: no source passage attached"}</p>{sources.length>0&&<><select aria-label={`Scene ${index+1} source`} value={scene.source_references?.[0]?.sourceId??""} onChange={event=>update(index,{source_references:event.target.value?[{sourceId:event.target.value,passage:""}]:[]})} className={inputClass}><option value="">No source reference</option>{sources.map(source=><option key={source.id} value={source.id}>{source.title}</option>)}</select>{scene.source_references?.[0]&&<textarea aria-label={`Scene ${index+1} supporting passage`} rows={2} value={scene.source_references[0].passage} onChange={event=>update(index,{source_references:[{sourceId:scene.source_references![0].sourceId,passage:event.target.value}]})} placeholder="Copy an exact supporting passage from the selected source" className={inputClass}/>}</>}</div>
      <div className="flex flex-wrap gap-3 text-xs text-zinc-300"><button disabled={index===0} onClick={()=>move(index,-1)} className="rounded border border-zinc-700 px-3 py-1.5 disabled:opacity-30">Move up</button><button disabled={index===board.scenes.length-1} onClick={()=>move(index,1)} className="rounded border border-zinc-700 px-3 py-1.5 disabled:opacity-30">Move down</button><button disabled={board.scenes.length<=1} onClick={()=>move(index,0)} className="rounded border border-red-900 px-3 py-1.5 text-red-300 disabled:opacity-30">Remove scene</button>{scene.audio_url&&<button disabled={dirty} onClick={()=>void save(true,{sceneId:scene.scene_id,kind:"voice"})} className="rounded border border-zinc-700 px-3 py-1.5 disabled:opacity-30">Regenerate voice</button>}{(scene.visual_url||scene.thumbnail_url)&&<button disabled={dirty} onClick={()=>void save(true,{sceneId:scene.scene_id,kind:"visual"})} className="rounded border border-zinc-700 px-3 py-1.5 disabled:opacity-30">Regenerate visual</button>}</div>
    </fieldset>)}
    <div className="flex flex-wrap gap-3"><button disabled={!editable||busy||!dirty} onClick={()=>void save(false)} className="rounded border border-zinc-700 px-4 py-2 text-sm disabled:opacity-40">Save draft</button><button disabled={!editable||busy||data.approvedRevision===data.revision&&!dirty} onClick={()=>void save(true)} className="rounded bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-40">{busy?"Saving…":`Approve and render${data.additionalCredits?" · 1 credit":""}`}</button><button disabled={busy} onClick={()=>void load()} className="text-sm text-zinc-400 underline">Reload saved revision{dirty?" (discard edits)":""}</button></div>
  </section>;
}


