/** Scene-level speech synthesis with durable checkpoints and provider word timing. */
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import { z } from "zod";
import ffmpeg from "../ffmpeg";
import { downloadFromS3, uploadFileToS3 } from "../s3";
import { concatFileLine } from "../cinematic/render-options";
import type { ScriptSegment } from "./script";
import type { TimedWord, VoiceSceneCheckpoint } from "../types/cinematic";

export const VOICE_MAP: Record<string, string> = {
  male: "en-US-GuyNeural", female: "en-US-JennyNeural", ai_narrator: "en-US-AriaNeural",
};
const LANGUAGE_VOICES: Record<string, Record<string, string>> = {
  en: VOICE_MAP,
  hi: { male: "hi-IN-MadhurNeural", female: "hi-IN-SwaraNeural", ai_narrator: "hi-IN-SwaraNeural" },
  es: { male: "es-ES-AlvaroNeural", female: "es-ES-ElviraNeural", ai_narrator: "es-ES-ElviraNeural" },
};

export function resolveVoice(voice = "ai_narrator", language = "en"): string {
  const aliases: Record<string, string> = { english: "en", hindi: "hi", spanish: "es" };
  const languageCode = aliases[language.toLowerCase()] ?? language.toLowerCase().split(/[-_]/)[0];
  const voices = LANGUAGE_VOICES[languageCode];
  if (!voices) throw new Error(`Unsupported narration language: ${language}`);
  if (/^[a-z]{2}-[A-Z]{2}-.+Neural$/.test(voice) && voice.startsWith(`${languageCode}-`)) return voice;
  const preference = voice === "en-US-GuyNeural" ? "male" : voice === "en-US-JennyNeural" ? "female" : voice;
  return voices[preference] ?? voices.ai_narrator;
}

export interface VoiceoverOptions {
  language?: string;
  pronunciationOverrides?: Record<string, string>;
  sceneCache?: VoiceSceneCheckpoint[];
  onSceneComplete?: (checkpoint: VoiceSceneCheckpoint) => Promise<void>;
  signal?: AbortSignal;
}

const metadataSchema = z.object({ Metadata: z.array(z.object({
  Type: z.string(), Data: z.object({ Offset: z.number().nonnegative(), Duration: z.number().nonnegative(), text: z.object({ Text: z.string() }) }),
})) });

export function parseWordBoundaries(metadata: unknown, sceneIndex: number, duration: number): TimedWord[] {
  const parsed = metadataSchema.safeParse(metadata);
  if (!parsed.success) return [];
  return parsed.data.Metadata.filter((event) => event.Type === "WordBoundary").map(({ Data }) => ({
    text: Data.text.Text, startTime: Math.min(duration, Data.Offset / 10_000_000),
    endTime: Math.min(duration, (Data.Offset + Data.Duration) / 10_000_000), sceneIndex,
  })).filter((word) => word.text.trim() && word.endTime > word.startTime);
}

export function applyPronunciationOverrides(text: string, overrides: Record<string, string> = {}): string {
  for (const [term, replacement] of Object.entries(overrides).sort(([a], [b]) => b.length - a.length)) {
    if (!term || !replacement) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), replacement);
  }
  return text;
}

function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function generateVoiceover(
  jobId: string, segments: ScriptSegment[], voiceId: string, onLog?: (msg: string) => void, options: VoiceoverOptions = {},
): Promise<{ s3Key: string; durationSeconds: number; sceneDurations: number[]; words: TimedWord[]; sceneAssets: VoiceSceneCheckpoint[] }> {
  if (!segments.length || segments.some((segment) => !segment.segment?.trim())) throw new Error("Voiceover requires non-empty narration per scene");
  const voice = resolveVoice(voiceId, options.language ?? (/^[a-z]{2}-/.test(voiceId) ? voiceId.slice(0, 2) : "en"));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "animatube-voice-"));
  const sceneAssets: VoiceSceneCheckpoint[] = [];
  const audioPaths: string[] = [];
  try {
    for (const [sceneIndex, segment] of segments.entries()) {
      options.signal?.throwIfAborted();
      const text = applyPronunciationOverrides(segment.segment, options.pronunciationOverrides);
      const inputHash = createHash("sha256").update(JSON.stringify({ version: 2, voice, text })).digest("hex");
      const sceneDir = path.join(tmpDir, String(sceneIndex));
      fs.mkdirSync(sceneDir);
      const audioPath = path.join(sceneDir, "audio.mp3");
      const cached = options.sceneCache?.find((entry) => entry.inputHash === inputHash);
      let checkpoint: VoiceSceneCheckpoint | undefined;
      if (cached) {
        try {
          fs.writeFileSync(audioPath, await downloadFromS3(cached.s3Key));
          if(cached.contentHash&&createHash("sha256").update(fs.readFileSync(audioPath)).digest("hex")!==cached.contentHash)throw new Error("Saved narration changed");
          const durationSeconds = await probeAudioDuration(audioPath);
          if (Math.abs(durationSeconds - cached.durationSeconds) < 0.1) {
            checkpoint = {...cached,sceneIndex,words:cached.words.map(word=>({...word,sceneIndex}))};
            onLog?.(`Reusing saved narration for scene ${sceneIndex + 1}`);
          }
        } catch { onLog?.(`Saved narration for scene ${sceneIndex + 1} is unavailable; regenerating this scene`); }
      }
      if (!checkpoint) {
        onLog?.(`Generating narration for scene ${sceneIndex + 1}/${segments.length}`);
        const metadataPath = await synthesizeScene(sceneDir, xmlEscape(text), voice, options.signal, onLog);
        const durationSeconds = await probeAudioDuration(audioPath);
        const words = metadataPath && fs.existsSync(metadataPath)
          ? parseWordBoundaries(JSON.parse(fs.readFileSync(metadataPath, "utf8")), sceneIndex, durationSeconds) : [];
        if (!words.length) onLog?.(`Word timing is unavailable for scene ${sceneIndex + 1}; captions will use measured scene timing`);
        const s3Key = `jobs/${jobId}/voice/scenes/${sceneIndex}-${inputHash.slice(0, 20)}.mp3`;
        await uploadFileToS3(s3Key, audioPath, "audio/mpeg");
        checkpoint = { sceneIndex, inputHash, s3Key, durationSeconds, words,contentHash:createHash("sha256").update(fs.readFileSync(audioPath)).digest("hex") };
        await options.onSceneComplete?.(checkpoint);
      }
      sceneAssets.push(checkpoint);
      if(cached)await options.onSceneComplete?.(checkpoint);
      audioPaths.push(audioPath);
    }
    const concatPath = path.join(tmpDir, "audio.txt");
    fs.writeFileSync(concatPath, audioPaths.map(concatFileLine).join("\n"));
    const audioPath = path.join(tmpDir, "voice.mp3");
    await new Promise<void>((resolve, reject) => ffmpeg().input(concatPath).inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c:a", "copy"]).output(audioPath).on("end", () => resolve()).on("error", reject).run());
    const durationSeconds = await probeAudioDuration(audioPath);
    const sum = sceneAssets.reduce((total, scene) => total + scene.durationSeconds, 0);
    const scale = durationSeconds / sum;
    const sceneDurations = sceneAssets.map((scene) => scene.durationSeconds * scale);
    const words: TimedWord[] = [];
    let cursor = 0;
    for (const scene of sceneAssets) {
      words.push(...scene.words.map((word) => ({ ...word, startTime: (cursor + word.startTime) * scale, endTime: (cursor + word.endTime) * scale })));
      cursor += scene.durationSeconds;
    }
    const s3Key = `jobs/${jobId}/voice.mp3`;
    await uploadFileToS3(s3Key, audioPath, "audio/mpeg");
    onLog?.(`Narration complete: ${durationSeconds.toFixed(1)}s in ${segments.length} measured scenes`);
    return { s3Key, durationSeconds, sceneDurations, words, sceneAssets };
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
}

async function synthesizeScene(dir: string, text: string, voice: string, signal?: AbortSignal, onLog?: (msg: string) => void): Promise<string | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    signal?.throwIfAborted();
    const tts = new MsEdgeTTS();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await new Promise<string | null>((resolve, reject) => {
        timer = setTimeout(() => { tts.close(); reject(new Error("Voice service timed out after 90 seconds")); }, 90_000);
        abort = () => { tts.close(); reject(signal?.reason ?? new Error("Narration cancelled")); };
        signal?.addEventListener("abort", abort, { once: true });
        void (async () => {
          await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
          const result = await tts.toFile(dir, text);
          resolve(result.metadataFilePath);
        })().catch(reject);
      });
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      fs.rmSync(path.join(dir, "audio.mp3"), { force: true });
      fs.rmSync(path.join(dir, "metadata.json"), { force: true });
      if (attempt < 3) {
        onLog?.(`Voice service retry ${attempt + 1}/3`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) signal?.removeEventListener("abort", abort);
      tts.close();
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Voice synthesis failed");
}

export function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => ffmpeg.ffprobe(filePath, (error, metadata) => {
    if (error) return reject(error);
    const duration = metadata.format.duration;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return reject(new Error("Audio has no valid measured duration"));
    resolve(duration);
  }));
}
