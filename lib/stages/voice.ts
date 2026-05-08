/**
 * Stage 2 — Voiceover Generation
 * Uses Microsoft Edge TTS (free, no API key) via the msedge-tts npm package.
 * Generates MP3 audio file directly to disk.
 */
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import ffmpeg from "../ffmpeg";
import { uploadFileToS3 } from "../s3";
import type { ScriptSegment } from "./script";

// Map friendly voice preference names to Microsoft Edge Neural voice names
export const VOICE_MAP: Record<string, string> = {
  male: "en-US-GuyNeural",
  female: "en-US-JennyNeural",
  ai_narrator: "en-US-AriaNeural",
};

export async function generateVoiceover(
  jobId: string,
  segments: ScriptSegment[],
  voiceId: string,
  onLog?: (msg: string) => void
): Promise<{ s3Key: string; durationSeconds: number }> {
  // Concatenate all segments into one narration text
  const fullText = segments.map((s) => s.segment).join(" ");
  onLog?.(`Generating voiceover (${fullText.length} chars) with voice "${voiceId}"`);

  // Create temp directory for audio file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `animatube-${jobId}-`));
  
  try {
    // Initialize msedge-tts
    const tts = new MsEdgeTTS();
    
    // Set voice metadata
    await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    
    // Generate voiceover - toFile expects a directory path, creates audio.mp3 inside
    await tts.toFile(tmpDir, fullText);
    
    // The actual audio file is created as audio.mp3 in the temp directory
    const audioPath = path.join(tmpDir, "audio.mp3");
    
    // Verify file was created
    if (!fs.existsSync(audioPath)) {
      throw new Error("Voiceover file was not created at: " + audioPath);
    }
    
    const fileSize = fs.statSync(audioPath).size;
    onLog?.(`Voiceover generated (${(fileSize / 1024).toFixed(0)} KB)`);
    console.log("Voiceover generated:", audioPath);

    // Probe audio duration
    const durationSeconds = await probeAudioDuration(audioPath);
    onLog?.(`Audio duration: ${durationSeconds.toFixed(1)}s`);

    // Upload to S3
    const s3Key = `jobs/${jobId}/voice.mp3`;
    await uploadFileToS3(s3Key, audioPath, "audio/mpeg");
    onLog?.(`Voiceover uploaded to S3: ${s3Key}`);

    // Cleanup temp
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return { s3Key, durationSeconds };
  } catch (err) {
    console.error("VOICEOVER ERROR:", err);
    // Cleanup temp directory on error
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    throw err;
  }
}

/** Use ffprobe to get audio duration in seconds. */
function probeAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}
