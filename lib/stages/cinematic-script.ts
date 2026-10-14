/**
 * Stage 1 (Enhanced) — Cinematic Script Generation
 * Replaces the old script.ts with a two-phase approach:
 * 1. Story Planning (emotional beats, pacing, scene structure)
 * 2. Scene Script Generation (detailed narration for each scene)
 */
import { uploadToS3 } from "../s3";
import { generateStoryPlan } from "../cinematic/story-planner";
import { generateSceneScript, type SceneScriptOutput } from "../cinematic/scene-script-generator";
import type { StoryPlan } from "../types/cinematic";
import type { RenderOptions } from "../types/cinematic";

export interface CinematicScriptResult {
  storyPlan: StoryPlan;
  script: SceneScriptOutput;
}
export interface CinematicScriptOptions extends RenderOptions {
  savedStoryPlan?: StoryPlan;
  onStoryPlanComplete?: (plan:StoryPlan,key:string)=>Promise<void>;
}

export async function generateCinematicScript(
  jobId: string,
  topic: string,
  style: string,
  duration: string, // "short" | "long"
  language: string,
  onLog?: (msg: string) => void,
  options: CinematicScriptOptions = {},
): Promise<CinematicScriptResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const durationLabel = duration === "short" ? "3-minute" : "8-minute";
  onLog?.(`Generating cinematic ${durationLabel} ${style} video`);

  // Phase 1: Story Planning
  onLog?.(`📋 Phase 1: Planning story structure and emotional beats...`);
  if(options.savedStoryPlan)onLog?.("Reusing the verified saved story plan");
  const storyPlan = options.savedStoryPlan ?? await generateStoryPlan(
    { topic, style, duration, language, visualStyle: options.visualStyle, targetDuration: options.targetDuration },
    onLog
  );

  // Save story plan to S3
  await uploadToS3(
    `jobs/${jobId}/story-plan.json`,
    JSON.stringify(storyPlan, null, 2),
    "application/json"
  );
  await options.onStoryPlanComplete?.(storyPlan,`jobs/${jobId}/story-plan.json`);

  // Phase 2: Scene Script Generation
  onLog?.(`✍️ Phase 2: Writing scene-by-scene narration...`);
  const script = await generateSceneScript(
    storyPlan,
    topic,
    style,
    language,
    onLog
  );

  // Save script to S3
  await uploadToS3(
    `jobs/${jobId}/cinematic-script.json`,
    JSON.stringify(script, null, 2),
    "application/json"
  );

  onLog?.(
    `✓ Cinematic script ready: "${script.title}" (${script.scenes.length} scenes, ${storyPlan.total_duration}s total)`
  );

  return { storyPlan, script };
}
