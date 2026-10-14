/**
 * Cinematic Story Planner
 * AI-powered planning layer that creates structured story arcs before script generation.
 * Identifies emotional beats, pacing, and scene objectives.
 */
import Groq from "groq-sdk";
import { withGroqRateLimitRetry } from "../groq-retry";
import type { StoryPlan } from "../types/cinematic";
import { storyPlanSchema, normalizeDurations } from "./schemas";



export interface StoryPlannerInput {
  topic: string;
  style: string;
  duration: string; // "short" | "long"
  language: string;
  visualStyle?: string;
  targetDuration?: number;
}

export async function generateStoryPlan(
  input: StoryPlannerInput,
  onLog?: (msg: string) => void
): Promise<StoryPlan> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY?.trim(), timeout: 90_000, maxRetries: 0 });
  const targetDuration = input.targetDuration ?? (input.duration === "short" ? 180 : 480);
  if (!Number.isFinite(targetDuration) || targetDuration < 15 || targetDuration > 900) throw new Error("Target duration must be 15–900 seconds");
  const visualStyle = input.visualStyle ?? "natural documentary footage and clear explanatory graphics";
  const sceneCount = Math.max(2, Math.min(60, Math.round(targetDuration / 15)));

  onLog?.(`Planning cinematic story structure for ${input.duration} video`);

  const systemPrompt = `You are a master cinematic storyteller and director. Your job is to plan the emotional and narrative structure of a video BEFORE the script is written.

You must create a detailed scene-by-scene plan that:
- Identifies emotional beats and pacing
- Creates suspense and engagement
- Plans intro, buildup, climax, and ending
- Assigns camera directions and lighting for each scene
- Ensures cinematic flow and professional storytelling

Output ONLY valid JSON in this exact structure:
{
  "total_duration": number (in seconds),
  "story_arc": {
    "intro": { "start": number, "end": number },
    "buildup": { "start": number, "end": number },
    "climax": { "start": number, "end": number },
    "resolution": { "start": number, "end": number }
  },
  "scenes": [
    {
      "scene": number (1-indexed),
      "purpose": "string (what this scene accomplishes)",
      "emotion": "mystery|suspense|joy|sadness|fear|anger|wonder|tension|calm|excitement|melancholy|triumph",
      "camera": "string (camera movement description)",
      "lighting": "string (lighting mood)",
      "duration_seconds": number (1-120 seconds per scene),
      "narrative_beat": "hook|introduction|rising_action|conflict|climax|falling_action|resolution|call_to_action"
    }
  ],
  "overall_mood": "string",
  "visual_style": "requested visual style"
}

CRITICAL RULES:
- Content format is ${input.style}. Visual style is ${visualStyle}. Do not impose anime or dark fantasy unless requested.
- Camera must be one of: slow dolly forward, slow dolly backward, pan left, pan right, static, slow zoom in, slow zoom out, crane up, crane down, orbit, handheld shake.
- Total duration must equal ${targetDuration} seconds
- Create ${sceneCount} scenes (each 5-30 seconds)
- First scene MUST be a hook (grab attention in 5-10 seconds)
- Build tension gradually through rising action
- Place climax at 70-80% through the video
- End with resolution and call-to-action
- Vary emotions to maintain engagement
- Use cinematic camera movements (dolly, crane, pan, zoom)
- Lighting should match emotion (dark for tension, bright for joy, etc.)`;

  const userPrompt = `Create a cinematic story plan for a ${input.style} video about: ${input.topic}

Duration: ${targetDuration} seconds (${input.duration})
Language: ${input.language}
Visual style: ${visualStyle}

Plan the emotional journey, pacing, and visual direction for maximum engagement.`;

  const completion = await withGroqRateLimitRetry(() => groq.chat.completions.create({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 3000,
    temperature: 0.8, // Higher creativity for story planning
  }), onLog);

  const rawContent = completion.choices[0].message.content;
  if (!rawContent) throw new Error("Story planner returned empty response");

  let storyPlan: StoryPlan;
  try {
    storyPlan = storyPlanSchema.parse(JSON.parse(rawContent));
  } catch {
    throw new Error("Story planner returned invalid structured output");
  }

  storyPlan.scenes = normalizeDurations(storyPlan.scenes, targetDuration);
  storyPlan.total_duration = targetDuration;
  storyPlan.visual_style = visualStyle;

  onLog?.(`✓ Story plan created: ${storyPlan.scenes.length} scenes, ${storyPlan.overall_mood} mood`);

  return storyPlan;

}

/**
 * Get recommended words per second based on emotion and narrative beat
 */
export function getEmotionalPacing(
  emotion: string,
  narrativeBeat: string
): number {
  // Base pacing: 2.5 words per second
  let wps = 2.5;

  // Adjust for emotion
  const slowEmotions = ["sadness", "melancholy", "mystery", "suspense", "tension"];
  const fastEmotions = ["excitement", "fear", "anger", "action"];

  if (slowEmotions.includes(emotion)) {
    wps = 2.2; // Slower, more dramatic
  } else if (fastEmotions.includes(emotion)) {
    wps = 2.8; // Faster, more urgent
  }

  // Adjust for narrative beat
  if (narrativeBeat === "hook") {
    wps = 2.7; // Quick hook to grab attention
  } else if (narrativeBeat === "climax") {
    wps = 2.3; // Slower for dramatic impact
  }

  return wps;
}
