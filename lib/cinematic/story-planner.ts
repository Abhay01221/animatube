/**
 * Cinematic Story Planner
 * AI-powered planning layer that creates structured story arcs before script generation.
 * Identifies emotional beats, pacing, and scene objectives.
 */
import Groq from "groq-sdk";
import type { StoryPlan, ScenePlan, StoryArc } from "../types/cinematic";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY?.trim() });

export interface StoryPlannerInput {
  topic: string;
  style: string;
  duration: string; // "short" | "long"
  language: string;
}

export async function generateStoryPlan(
  input: StoryPlannerInput,
  onLog?: (msg: string) => void
): Promise<StoryPlan> {
  const targetDuration = input.duration === "short" ? 180 : 480; // 3 min or 8 min
  const sceneCount = input.duration === "short" ? 15 : 30;

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
      "duration_seconds": number (5-15 seconds per scene),
      "narrative_beat": "hook|introduction|rising_action|conflict|climax|falling_action|resolution|call_to_action"
    }
  ],
  "overall_mood": "string",
  "visual_style": "MAPPA-inspired anime, dark fantasy cinematic aesthetic"
}

CRITICAL RULES:
- Total duration must equal ${targetDuration} seconds
- Create ${sceneCount} scenes (each 5-15 seconds)
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
Style: MAPPA-inspired anime with dark fantasy cinematic aesthetic

Plan the emotional journey, pacing, and visual direction for maximum engagement.`;

  // Retry logic for rate limits
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_tokens: 3000,
        temperature: 0.8, // Higher creativity for story planning
      });

      const rawContent = completion.choices[0].message.content;
      if (!rawContent) throw new Error("Story planner returned empty response");

      let storyPlan: StoryPlan;
      try {
        storyPlan = JSON.parse(rawContent);
      } catch {
        throw new Error(`Story planner returned invalid JSON: ${rawContent.slice(0, 200)}`);
      }

      // Validate structure
      if (!storyPlan.scenes || storyPlan.scenes.length === 0) {
        throw new Error("Story plan missing scenes");
      }

      // Validate total duration
      const totalPlannedDuration = storyPlan.scenes.reduce(
        (sum, scene) => sum + scene.duration_seconds,
        0
      );

      if (Math.abs(totalPlannedDuration - targetDuration) > targetDuration * 0.1) {
        onLog?.(`⚠ Adjusting scene durations: planned ${totalPlannedDuration}s, target ${targetDuration}s`);
        
        // Proportionally adjust scene durations
        const scale = targetDuration / totalPlannedDuration;
        storyPlan.scenes.forEach(scene => {
          scene.duration_seconds = Math.round(scene.duration_seconds * scale);
        });
      }

      onLog?.(`✓ Story plan created: ${storyPlan.scenes.length} scenes, ${storyPlan.overall_mood} mood`);
      
      return storyPlan;
    } catch (err: any) {
      lastError = err;
      
      // Check if it's a rate limit error
      if (err.message?.includes("Rate limit") || err.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        onLog?.(`⚠ Rate limit hit, waiting ${waitTime / 1000}s before retry ${attempt}/3...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // If not a rate limit error, throw immediately
      throw err;
    }
  }

  // All retries failed
  throw new Error(`Story planning failed after 3 attempts: ${lastError?.message}`);
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
