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
Output ONLY valid JSON in this exact shape:
{
  "title": "string",
  "description": "string (YouTube description, 200-300 chars)",
  "tags": ["string", ...],
  "script": [
    { "segment": "string (under 20 words)", "duration_seconds": number, "visual_cue": "string (search query for stock footage)" }
  ]
}
Keep each segment under 20 words for subtitle readability. Include 8-15 segments.`;

  const userPrompt = `Write a ${durationLabel} script for a ${style} video about: ${topic}.
Language: ${language}.`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2000,
  });

  const rawContent = completion.choices[0].message.content;
  if (!rawContent) throw new Error("Groq returned an empty response");

  let scriptData: ScriptJSON;
  try {
    scriptData = JSON.parse(rawContent);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${rawContent.slice(0, 200)}`);
  }

  // Validate shape
  if (
    !scriptData.title ||
    !Array.isArray(scriptData.script) ||
    scriptData.script.length === 0
  ) {
    throw new Error("Groq script JSON missing required fields");
  }

  onLog?.(`Script ready: "${scriptData.title}" (${scriptData.script.length} segments)`);

  // Persist to S3
  await uploadToS3(
    `jobs/${jobId}/script.json`,
    JSON.stringify(scriptData, null, 2),
    "application/json"
  );

  return scriptData;
}
