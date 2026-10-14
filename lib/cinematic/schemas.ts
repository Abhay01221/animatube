import { z } from "zod";

export const emotionSchema = z.enum(["mystery", "suspense", "joy", "sadness", "fear", "anger", "wonder", "tension", "calm", "excitement", "melancholy", "triumph"]);
export const cameraSchema = z.enum(["slow dolly forward", "slow dolly backward", "pan left", "pan right", "static", "slow zoom in", "slow zoom out", "crane up", "crane down", "orbit", "handheld shake"]);
export const characterSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(100), hairstyle: z.string().max(500),
  clothing: z.string().max(500), facial_features: z.string().max(500), color_palette: z.array(z.string().max(100)).max(12),
  personality_expression: z.string().max(500), anime_style_notes: z.string().max(500).default(""),
});
export const cinematicSceneSchema = z.object({
  scene_id: z.number().int().positive(), duration_seconds: z.number().min(1).max(120),
  narration: z.string().trim().min(1).max(6000), emotion: emotionSchema,
  environment: z.string().min(1).max(2000), camera_direction: cameraSchema,
  visual_prompt: z.string().min(1).max(3000),
  transition_type: z.enum(["cut", "fade", "fade through fog", "dissolve", "wipe", "blur transition", "light flash", "particle dissolve"]),
  soundtrack_mood: z.enum(["dark ambient drones", "soft piano orchestral", "percussion heavy orchestral", "japanese flute ambience", "epic cinematic", "mysterious whispers", "heartbeat tension", "gentle emotional", "action intense", "calm meditation"]),
  shot_type: z.enum(["extreme close-up", "close-up", "medium shot", "wide shot", "extreme wide shot", "over-the-shoulder", "dutch angle", "birds eye view", "low angle", "high angle"]).optional(),
  lighting: z.string().max(500).optional(), color_palette: z.array(z.string().max(100)).max(12).optional(),
  caption:z.string().max(6000).optional(),
  visual_asset: z.object({ s3Key: z.string().min(1).max(2000), type: z.enum(["clip", "image"]), provider: z.enum(["s3", "supabase"]).optional() }).optional(),
  diagram: z.object({ title: z.string().min(1).max(200), items: z.array(z.string().min(1).max(200)).min(1).max(8) }).optional(),
  source_references: z.array(z.object({ sourceId: z.string().min(1), passage: z.string().max(4000) })).max(20).optional(),
});
export const sceneScriptSchema = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().max(5000),
  tags: z.array(z.string().max(100)).max(30), scenes: z.array(cinematicSceneSchema).min(1).max(60),
  characters: z.array(characterSchema).max(20).optional(),
}).refine((script) => new Set(script.scenes.map((scene) => scene.scene_id)).size === script.scenes.length, "Scene IDs must be unique");
const timeRange = z.object({ start: z.number().nonnegative().max(1800), end: z.number().nonnegative().max(1800) }).refine(({ start, end }) => end >= start, "Invalid story range");
export const storyPlanSchema = z.object({
  total_duration: z.number().positive().max(1800),
  story_arc: z.object({ intro: timeRange, buildup: timeRange, climax: timeRange, resolution: timeRange }),
  scenes: z.array(z.object({ scene: z.number().int().positive(), purpose: z.string().min(1).max(2000), emotion: emotionSchema,
    camera: cameraSchema, lighting: z.string().min(1).max(500), duration_seconds: z.number().min(1).max(120),
    narrative_beat: z.enum(["hook", "introduction", "rising_action", "conflict", "climax", "falling_action", "resolution", "call_to_action"]),
  })).min(1).max(60),
  characters: z.array(characterSchema).max(20).optional(), overall_mood: z.string().min(1).max(500), visual_style: z.string().min(1).max(500),
}).refine((plan) => new Set(plan.scenes.map((scene) => scene.scene)).size === plan.scenes.length, "Scene IDs must be unique");

export function normalizeDurations<T extends { duration_seconds: number }>(scenes: T[], target: number): T[] {
  const total = scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
  if (!total || !Number.isFinite(target) || target < scenes.length || target > 1800) throw new Error("Invalid target duration");
  const scaled = scenes.map((scene) => ({ ...scene, duration_seconds: Math.round(scene.duration_seconds / total * target * 1000) / 1000 }));
  if (scaled.some((scene) => scene.duration_seconds < 1 || scene.duration_seconds > 120)) throw new Error("Target duration exceeds scene duration bounds");
  scaled[scaled.length - 1].duration_seconds += target - scaled.reduce((sum, scene) => sum + scene.duration_seconds, 0);
  return scaled;
}
