/**
 * Scene-Based Script Generator
 * Generates detailed scripts based on story plans, with scene-by-scene breakdown.
 * Maintains duration awareness and emotional pacing.
 */
import Groq from "groq-sdk";
import { withGroqRateLimitRetry } from "../groq-retry";
import type { StoryPlan, CinematicScene, CharacterDescription } from "../types/cinematic";
import { getEmotionalPacing } from "./story-planner";
import { sceneScriptSchema } from "./schemas";



export interface SceneScriptOutput {
  title: string;
  description: string;
  tags: string[];
  scenes: CinematicScene[];
  characters?: CharacterDescription[];
}

export async function generateSceneScript(
  storyPlan: StoryPlan,
  topic: string,
  style: string,
  language: string,
  onLog?: (msg: string) => void
): Promise<SceneScriptOutput> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY?.trim(), timeout: 90_000, maxRetries: 0 });
  onLog?.(`Generating scene-by-scene script based on story plan`);

  const systemPrompt = `You are an expert video scriptwriter specializing in cinematic storytelling. You write engaging, emotionally resonant scripts with perfect pacing.

You will receive a STORY PLAN with scene-by-scene emotional beats and timing. Your job is to write the actual narration for each scene.

Output ONLY valid JSON in this exact structure:
{
  "title": "string (compelling YouTube title)",
  "description": "string (YouTube description, 200-300 chars)",
  "tags": ["string", ...] (relevant YouTube tags),
  "scenes": [
    {
      "scene_id": number,
      "duration_seconds": number,
      "narration": "string (2-4 complete sentences)",
      "emotion": "string (from story plan)",
      "environment": "string (detailed environment description)",
      "camera_direction": "string (from story plan)",
      "visual_prompt": "string (what to show visually)",
      "transition_type": "cut|fade|fade through fog|dissolve|wipe|blur transition|light flash|particle dissolve",
      "soundtrack_mood": "gentle emotional|calm meditation|epic cinematic|soft piano orchestral|dark ambient drones|percussion heavy orchestral|japanese flute ambience|mysterious whispers|heartbeat tension|action intense",
      "source_references": [{"sourceId":"ID from approved reference material","passage":"exact supporting passage copied from that source"}]
    }
  ],
  "characters": [
    {
      "id": "string",
      "name": "string",
      "hairstyle": "string",
      "clothing": "string",
      "facial_features": "string",
      "color_palette": ["string", ...],
      "personality_expression": "string",
      "anime_style_notes": "string"
    }
  ]
}

CRITICAL NARRATION RULES:
- source_references must be empty when no approved sources are supplied. Otherwise use only supplied source IDs and exact supporting passages. Leave unsupported claims unreferenced for human review.
- Each scene's narration must fill its duration_seconds when spoken
- Use emotional pacing: slower for dramatic scenes (~2.2 wps), faster for action (~2.8 wps)
- Write 2-4 complete, engaging sentences per scene
- Vary sentence structure and length for natural flow
- Match narration tone to the scene's emotion
- Avoid robotic or repetitive phrasing
- Create smooth narrative flow between scenes

VISUAL PROMPT RULES:
- Describe what should be shown on screen
- Use only the visual style specified in the story plan; keep content format separate
- Include character actions and expressions
- Describe environment details
- Match visual mood to emotion

CHARACTER CONSISTENCY:
- If characters appear, define them in the characters array
- Use consistent descriptions across all scenes
- Describe factual visual references for documentary and educational content; only describe fictional characters where requested`;

  const scenePlansText = storyPlan.scenes
    .map(
      (scene) =>
        `Scene ${scene.scene}: ${scene.purpose} | ${scene.duration_seconds}s | Emotion: ${scene.emotion} | Beat: ${scene.narrative_beat} | Camera: ${scene.camera} | Lighting: ${scene.lighting}`
    )
    .join("\n");

  const userPrompt = `Write a complete scene-by-scene script for a ${style} video about: ${topic}

Language: ${language}
Total Duration: ${storyPlan.total_duration} seconds
Visual Style: ${storyPlan.visual_style}
Overall Mood: ${storyPlan.overall_mood}

STORY PLAN:
${scenePlansText}

Write engaging narration for each scene that:
1. Matches the planned emotion and narrative beat
2. Fills the exact duration when spoken at appropriate pace
3. Creates a cohesive story from start to finish
4. Uses cinematic, engaging language
5. Maintains consistent character descriptions if applicable`;

  const completion = await withGroqRateLimitRetry(() => groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4500,
    temperature: 0.7,
  }), onLog);

  const rawContent = completion.choices[0].message.content;
  if (!rawContent) throw new Error("Scene script generator returned empty response");

  let scriptOutput: SceneScriptOutput;
  try {
    scriptOutput = sceneScriptSchema.parse(JSON.parse(rawContent));
  } catch {
    throw new Error("Scene script generator returned invalid structured output");
  }

  // Validate and enhance scenes
  if (!scriptOutput.scenes || scriptOutput.scenes.length === 0) {
    throw new Error("Script output missing scenes");
  }

  if (scriptOutput.scenes.length !== storyPlan.scenes.length) throw new Error("Script scene count does not match the approved story plan");

  // Validate narration duration for each scene
  for (let i = 0; i < scriptOutput.scenes.length; i++) {
    const scene = scriptOutput.scenes[i];
    const planScene = storyPlan.scenes[i];

    // Ensure scene has required fields from plan
    scene.emotion = scene.emotion || planScene.emotion;
    scene.camera_direction = scene.camera_direction || "static";
    scene.duration_seconds = scene.duration_seconds || planScene.duration_seconds;

    // Validate narration length
    const wordCount = scene.narration.split(/\s+/).length;
    const expectedWPS = getEmotionalPacing(scene.emotion, planScene.narrative_beat);
    const estimatedDuration = wordCount / expectedWPS;
    const targetDuration = scene.duration_seconds;

    if (Math.abs(estimatedDuration - targetDuration) > targetDuration * 0.3) {
      onLog?.(
        `⚠ Scene ${scene.scene_id}: narration mismatch (${estimatedDuration.toFixed(1)}s vs ${targetDuration}s)`
      );
      
      // Adjust duration to match actual narration
      // Actual TTS scene measurements determine playback and captions later.
      scene.duration_seconds = planScene.duration_seconds;
    }
  }

  // Calculate total duration
  const totalDuration = scriptOutput.scenes.reduce(
    (sum, scene) => sum + scene.duration_seconds,
    0
  );

  onLog?.(
    `✓ Script generated: ${scriptOutput.scenes.length} scenes, ${totalDuration}s total, "${scriptOutput.title}"`
  );

  return scriptOutput;

}

/**
 * Estimate narration duration from text
 */
export function estimateNarrationDuration(
  text: string,
  emotion: string,
  narrativeBeat: string
): number {
  const wordCount = text.split(/\s+/).length;
  const wps = getEmotionalPacing(emotion, narrativeBeat);
  return wordCount / wps;
}

/**
 * Validate that narration fills the target duration
 */
export function validateNarrationDuration(
  narration: string,
  targetDuration: number,
  emotion: string,
  narrativeBeat: string,
  tolerance: number = 0.2
): { valid: boolean; estimated: number; difference: number } {
  const estimated = estimateNarrationDuration(narration, emotion, narrativeBeat);
  const difference = Math.abs(estimated - targetDuration);
  const valid = difference <= targetDuration * tolerance;

  return { valid, estimated, difference };
}
