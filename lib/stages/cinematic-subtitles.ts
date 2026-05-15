/**
 * Cinematic Subtitle System
 * 
 * Generates professional, anime-style subtitles with:
 * - Phrase-by-phrase timing (not full paragraphs)
 * - Word-level synchronization
 * - Cinematic styling (small, bottom-center, shadows)
 * - Smooth fade animations
 * - Proper visual safety (no covering faces/action)
 */
import * as fs from "fs";
import * as path from "path";
import ffmpeg from "../ffmpeg";
import { downloadFromS3, uploadFileToS3 } from "../s3";
import type { CinematicScene } from "../types/cinematic";

export interface SubtitlePhrase {
  text: string;
  startTime: number;
  endTime: number;
  sceneIndex: number;
}

export interface CinematicSubtitleOptions {
  fontSize?: number; // Default: 18 (much smaller than old 22)
  fontName?: string; // Default: "Arial"
  primaryColor?: string; // Default: white
  outlineColor?: string; // Default: black
  outlineWidth?: number; // Default: 2
  shadowDepth?: number; // Default: 1
  marginBottom?: number; // Default: 50 (safe zone)
  fadeInDuration?: number; // Default: 0.2s
  fadeOutDuration?: number; // Default: 0.2s
  maxCharsPerLine?: number; // Default: 42 (cinematic standard)
  maxLines?: number; // Default: 2
}

const DEFAULT_OPTIONS: Required<CinematicSubtitleOptions> = {
  fontSize: 18,
  fontName: "Arial",
  primaryColor: "&HFFFFFF", // White
  outlineColor: "&H000000", // Black
  outlineWidth: 2,
  shadowDepth: 1,
  marginBottom: 50,
  fadeInDuration: 0.2,
  fadeOutDuration: 0.2,
  maxCharsPerLine: 42,
  maxLines: 2,
};

/**
 * Main entry point: Generate and burn cinematic subtitles
 */
export async function addCinematicSubtitles(
  jobId: string,
  scenes: CinematicScene[],
  timeline: Array<{ start_sec: number; end_sec: number; scene: CinematicScene }>,
  rawVideoS3Key: string,
  tmpDir: string,
  options: CinematicSubtitleOptions = {},
  onLog?: (msg: string) => void
): Promise<string> {
  onLog?.("🎬 Generating cinematic subtitles");

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Step 1: Split narration into cinematic phrases
  const phrases = generateSubtitlePhrases(scenes, timeline, opts);
  onLog?.(`  ✓ Split into ${phrases.length} cinematic phrases`);

  // Step 2: Generate ASS subtitle file (advanced styling)
  const assContent = generateASSSubtitles(phrases, opts);
  const assPath = path.join(tmpDir, "cinematic_subs.ass");
  fs.writeFileSync(assPath, assContent, "utf8");

  // Upload ASS to S3
  await uploadFileToS3(`jobs/${jobId}/cinematic_subs.ass`, assPath, "text/plain");
  onLog?.("  ✓ Subtitle file generated");

  // Step 3: Download raw video
  const rawVideoPath = path.join(tmpDir, "raw_video.mp4");
  onLog?.("  ⬇️ Downloading video for subtitle burn-in");
  const rawBuffer = await downloadFromS3(rawVideoS3Key);
  fs.writeFileSync(rawVideoPath, rawBuffer);

  // Step 4: Burn subtitles with cinematic styling
  const finalVideoPath = path.join(tmpDir, "final_video.mp4");
  onLog?.("  🔥 Burning cinematic subtitles into video");
  await burnCinematicSubtitles(rawVideoPath, assPath, finalVideoPath, opts);

  // Step 5: Upload final video
  const s3Key = `jobs/${jobId}/final_video.mp4`;
  await uploadFileToS3(s3Key, finalVideoPath, "video/mp4");
  onLog?.(`✓ Final cinematic video uploaded: ${s3Key}`);

  return s3Key;
}

/**
 * Split scene narration into cinematic phrases
 * 
 * Strategy:
 * - Split on natural breaks: periods, commas, semicolons
 * - Keep phrases short (max 42 chars per line, 2 lines max)
 * - Distribute timing evenly across phrases within each scene
 */
function generateSubtitlePhrases(
  scenes: CinematicScene[],
  timeline: Array<{ start_sec: number; end_sec: number; scene: CinematicScene }>,
  options: Required<CinematicSubtitleOptions>
): SubtitlePhrase[] {
  const phrases: SubtitlePhrase[] = [];

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const scene = entry.scene;
    const sceneDuration = entry.end_sec - entry.start_sec;
    const narration = scene.narration.trim();

    if (!narration) continue;

    // Split narration into phrases at natural breaks
    const rawPhrases = splitIntoPhrases(narration, options.maxCharsPerLine * options.maxLines);

    // Distribute timing evenly across phrases
    const phraseDuration = sceneDuration / rawPhrases.length;

    for (let j = 0; j < rawPhrases.length; j++) {
      const phraseText = rawPhrases[j].trim();
      if (!phraseText) continue;

      const startTime = entry.start_sec + j * phraseDuration;
      const endTime = startTime + phraseDuration;

      phrases.push({
        text: phraseText,
        startTime,
        endTime,
        sceneIndex: i,
      });
    }
  }

  return phrases;
}

/**
 * Split text into cinematic phrases at natural breaks
 * 
 * Priority:
 * 1. Sentence boundaries (. ! ?)
 * 2. Clause boundaries (, ; :)
 * 3. Word boundaries (if still too long)
 */
function splitIntoPhrases(text: string, maxLength: number): string[] {
  const phrases: string[] = [];

  // First split on sentence boundaries
  const sentences = text.split(/([.!?]+\s+)/).filter(Boolean);

  let currentPhrase = "";

  for (const part of sentences) {
    // If it's punctuation, add to current phrase
    if (/^[.!?]+\s*$/.test(part)) {
      currentPhrase += part;
      continue;
    }

    // If adding this would exceed max length, flush current phrase
    if (currentPhrase && (currentPhrase + part).length > maxLength) {
      phrases.push(currentPhrase.trim());
      currentPhrase = "";
    }

    // If this part alone is too long, split on commas
    if (part.length > maxLength) {
      const clauses = part.split(/([,;:]\s+)/).filter(Boolean);

      for (const clause of clauses) {
        if (/^[,;:]\s*$/.test(clause)) {
          currentPhrase += clause;
          continue;
        }

        if (currentPhrase && (currentPhrase + clause).length > maxLength) {
          phrases.push(currentPhrase.trim());
          currentPhrase = "";
        }

        // If still too long, split on words
        if (clause.length > maxLength) {
          const words = clause.split(/\s+/);
          for (const word of words) {
            if (currentPhrase && (currentPhrase + " " + word).length > maxLength) {
              phrases.push(currentPhrase.trim());
              currentPhrase = word;
            } else {
              currentPhrase += (currentPhrase ? " " : "") + word;
            }
          }
        } else {
          currentPhrase += (currentPhrase ? " " : "") + clause;
        }
      }
    } else {
      currentPhrase += (currentPhrase ? " " : "") + part;
    }
  }

  // Flush remaining
  if (currentPhrase.trim()) {
    phrases.push(currentPhrase.trim());
  }

  return phrases;
}

/**
 * Generate ASS subtitle file with cinematic styling
 * 
 * ASS format provides:
 * - Advanced styling control
 * - Fade animations
 * - Precise positioning
 * - Shadow and outline effects
 */
function generateASSSubtitles(
  phrases: SubtitlePhrase[],
  options: Required<CinematicSubtitleOptions>
): string {
  const lines: string[] = [];

  // ASS Header
  lines.push("[Script Info]");
  lines.push("Title: Cinematic Subtitles");
  lines.push("ScriptType: v4.00+");
  lines.push("WrapStyle: 0");
  lines.push("PlayResX: 1920");
  lines.push("PlayResY: 1080");
  lines.push("");

  // Style Definition
  lines.push("[V4+ Styles]");
  lines.push(
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
  );

  // Cinematic style: small, bottom-center, white text, black outline, shadow
  lines.push(
    `Style: Cinematic,${options.fontName},${options.fontSize},${options.primaryColor},&H000000FF,${options.outlineColor},&H80000000,1,0,0,0,100,100,0,0,1,${options.outlineWidth},${options.shadowDepth},2,20,20,${options.marginBottom},1`
  );
  lines.push("");

  // Events
  lines.push("[Events]");
  lines.push("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");

  // Add each phrase with fade effects
  for (const phrase of phrases) {
    const start = formatASSTime(phrase.startTime);
    const end = formatASSTime(phrase.endTime);

    // Calculate fade times in milliseconds
    const fadeInMs = Math.round(options.fadeInDuration * 1000);
    const fadeOutMs = Math.round(options.fadeOutDuration * 1000);

    // ASS fade effect: \fad(fadeIn, fadeOut)
    const fadeEffect = `{\\fad(${fadeInMs},${fadeOutMs})}`;

    // Wrap text if needed
    const wrappedText = wrapText(phrase.text, options.maxCharsPerLine);

    lines.push(
      `Dialogue: 0,${start},${end},Cinematic,,0,0,0,,${fadeEffect}${wrappedText}`
    );
  }

  return lines.join("\n");
}

/**
 * Wrap text to max characters per line
 */
function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine && (currentLine + " " + word).length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Join with ASS line break: \N
  return lines.join("\\N");
}

/**
 * Format seconds as ASS timestamp: H:MM:SS.CC
 */
function formatASSTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.round((totalSeconds % 1) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

/**
 * Burn ASS subtitles into video with FFmpeg
 */
function burnCinematicSubtitles(
  videoPath: string,
  assPath: string,
  outputPath: string,
  options: Required<CinematicSubtitleOptions>
): Promise<void> {
  // Escape path for FFmpeg filter (Windows backslashes need special handling)
  const escapedAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

  return new Promise((resolve, reject) => {
    console.log(`[Cinematic Subtitles] Burning subtitles: ${assPath}`);

    ffmpeg(videoPath)
      .videoFilters(`ass='${escapedAss}'`)
      .outputOptions([
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",             // was: fast — saves additional RAM
        "-crf",
        "22",
        "-c:a",
        "copy",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",                    // limit CPU/RAM usage
        "-max_muxing_queue_size",
        "512",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Cinematic Subtitles] FFmpeg command: ${cmd}`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(
            `[Cinematic Subtitles] Progress: ${progress.percent.toFixed(1)}%`
          );
        }
      })
      .on("end", () => {
        console.log(`[Cinematic Subtitles] Complete: ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Cinematic Subtitles] Error: ${err.message}`);
        console.error(`[Cinematic Subtitles] FFmpeg stderr:\n${stderr}`);
        reject(err);
      })
      .run();
  });
}
