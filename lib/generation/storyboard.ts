import { z } from "zod";
import { cameraSchema,cinematicSceneSchema,sceneScriptSchema } from "../cinematic/schemas";
import type { CinematicScene } from "../types/cinematic";
import { GenerationSchema } from "./config";

export const storyboardSceneSchema=z.object({
  scene_id:z.number().int().positive(),narration_preview:z.string().trim().min(1).max(6000),estimated_duration:z.number().min(1).max(120),visual_prompt:z.string().trim().min(1).max(3000),camera_notes:cameraSchema.optional(),
  visual_asset:cinematicSceneSchema.shape.visual_asset,diagram:cinematicSceneSchema.shape.diagram,source_references:cinematicSceneSchema.shape.source_references,
  caption:z.string().max(6000).optional(),
});
export const storyboardEditSchema=z.object({
  storyboard:z.object({scenes:z.array(storyboardSceneSchema).min(1).max(60)}),
  expectedRevision:z.number().int().positive(),approve:z.boolean().default(false),
  expectedAdditionalCredits:z.union([z.literal(0),z.literal(1)]).optional(),
  regenerateSceneId:z.number().int().positive().optional(),regenerateKind:z.enum(["voice","visual","all"]).default("all"),
  title:z.string().trim().min(1).max(200).optional(),description:z.string().max(5000).optional(),tags:z.array(z.string().max(100)).max(30).optional(),
  sources:GenerationSchema.shape.sources.optional(),
}).refine(v=>new Set(v.storyboard.scenes.map(s=>s.scene_id)).size===v.storyboard.scenes.length,"Scene IDs must be unique");
export function applyStoryboard(scriptValue:unknown,scenes:z.infer<typeof storyboardSceneSchema>[],userId:string,jobId:string):ReturnType<typeof sceneScriptSchema.parse>{
  const original=sceneScriptSchema.parse(scriptValue);
  const mapped=scenes.map(scene=>{
    const existing=original.scenes.find(s=>s.scene_id===scene.scene_id);
    if(!existing)throw new Error("Storyboard contains an unknown scene");
    if(scene.visual_asset && scene.visual_asset.s3Key!==existing.visual_asset?.s3Key && !scene.visual_asset.s3Key.startsWith(`uploads/${userId}/`) && !scene.visual_asset.s3Key.startsWith(`jobs/${jobId}_`))throw new Error("Visual asset does not belong to this project");
    return {...existing,narration:scene.narration_preview,duration_seconds:scene.estimated_duration,visual_prompt:scene.visual_prompt,camera_direction:scene.camera_notes??existing.camera_direction,visual_asset:scene.visual_asset,diagram:scene.diagram,source_references:scene.source_references,caption:scene.caption};
  });
  if(mapped.reduce((total,scene)=>total+scene.duration_seconds,0)>900)throw new Error("Storyboard exceeds the 15-minute limit");
  return {...original,scenes:mapped as CinematicScene[]};
}
