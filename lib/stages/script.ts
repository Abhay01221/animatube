/**
 * Stage 1 — Script Generation
 * Calls Groq (llama-3.3-70b-versatile) for fast, high-quality script generation.
 */
import dotenv from "dotenv";
import path from "path";

// Ensure .env is loaded even when this module is imported by the worker
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import Groq from "groq-sdk";
import { uploadToS3 } from "../s3";

console.log("[Script] Groq key present:", !!process.env.GROQ_API_KEY);

export interface ScriptSegment {
  segment: string;
  duration_seconds: number;
  visual_cue: string;
}

export interface ScriptJSON {
  title: string;
  description: string;
  tags: string[];
  script: ScriptSegment[];
}

export async function generateScript(
  jobId: string,
  topic: string,
  style: string,
  duration: string, // "short" | "long"
  language: string,
  onLog?: (msg: string) => void
): Promise<ScriptJSON> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const durationLabel = duration === "short" ? "3-minute" : "8-minute";
  onLog?.(`Generating ${durationLabel} ${style} script about: ${topic}`);

  const groq = new Groq({ apiKey });

  const systemPrompt = `You are a YouTube scriptwriter. Write engaging, retention-optimized scripts.
Structure: Hook (15s attention grab) → Main content (one visual cue per paragraph) → CTA.

CRITICAL: For ${durationLabel} videos, ensure the total duration adds up correctly:
- 3-minute videos: Total duration_seconds across ALL segments must sum to 180 seconds
- 8-minute videos: Total duration_seconds across ALL segments must sum to 480 seconds

Output ONLY valid JSON in this exact shape:
{
  "title": "string",
  "description": "string (YouTube description, 200-300 chars)",
  "tags": ["string", ...],
  "script": [
    { "segment": "string (2-4 sentences)", "duration_seconds": number, "visual_cue": "string (search query for stock footage)" }
  ]
}

DURATION REQUIREMENTS:
- For 3-minute videos: Include 12-18 segments, each 10-15 seconds long
- For 8-minute videos: Include 24-32 segments, each 15-20 seconds long
- Each segment MUST contain 2-4 complete sentences with enough words to fill its duration_seconds when spoken at normal pace
- Speaking pace: approximately 2.5 words per second (so a 15-second segment needs ~35-40 words)
- Write full, engaging sentences - do NOT write short phrases
- The sum of all duration_seconds MUST equal the target video length (180s or 480s)`;

  const userPrompt = `Write a ${durationLabel} script for a ${style} video about: ${topic}.
Language: ${language}.

IMPORTANT: Make sure the total duration of all segments adds up to exactly ${duration === "short" ? "180 seconds (3 minutes)" : "480 seconds (8 minutes)"}.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4000, // Increased to allow for longer, more detailed scripts
  });

  const rawContent = completion.choices[0].message.content;
  if (!rawContent) throw new Error("Groq returned an empty response");

  let scriptData: ScriptJSON;
  try {
    scriptData = JSON.parse(rawContent);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${rawContent.slice(0, 200)}`);
  }

  // Validate shape and duration
  if (
    !scriptData.title ||
    !Array.isArray(scriptData.script) ||
    scriptData.script.length === 0
  ) {
    throw new Error("Groq script JSON missing required fields");
  }

  // Calculate total duration and validate
  const totalDuration = scriptData.script.reduce((sum, seg) => sum + (seg.duration_seconds || 0), 0);
  const expectedDuration = duration === "short" ? 180 : 480; // 3 min or 8 min
  const tolerance = expectedDuration * 0.1; // 10% tolerance

  console.log(`[Script] Generated duration: ${totalDuration}s, Expected: ${expectedDuration}s`);

  if (Math.abs(totalDuration - expectedDuration) > tolerance) {
    console.warn(`[Script] Duration mismatch: got ${totalDuration}s, expected ${expectedDuration}s. Adjusting...`);
    
    // Proportionally adjust segment durations to match expected total
    const scale = expectedDuration / totalDuration;
    scriptData.script.forEach(seg => {
      seg.duration_seconds = Math.round(seg.duration_seconds * scale);
    });
    
    const adjustedTotal = scriptData.script.reduce((sum, seg) => sum + seg.duration_seconds, 0);
    console.log(`[Script] Adjusted duration: ${adjustedTotal}s`);
  }

  onLog?.(`Script ready: "${scriptData.title}" (${scriptData.script.length} segments, ${scriptData.script.reduce((sum, seg) => sum + seg.duration_seconds, 0)}s total)`);

  // Log segment breakdown for debugging
  console.log(`[Script] Segment breakdown:`);
  scriptData.script.forEach((seg, i) => {
    console.log(`[Script]   ${i + 1}. ${seg.duration_seconds}s: "${seg.segment}"`);
  });

  // Persist to S3
  await uploadToS3(
    `jobs/${jobId}/script.json`,
    JSON.stringify(scriptData, null, 2),
    "application/json"
  );

  return scriptData;
}
