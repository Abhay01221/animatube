/** Native-size scene assembly with independent render checkpoints. */
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import ffmpeg, { runFFmpeg } from "../ffmpeg";
import { downloadFromS3, uploadFileToS3 } from "../s3";
import { applyMotionEffectsToImage, applyMotionEffectsToClip } from "../cinematic/motion-effects";
import { concatFileLine, resolveRenderOptions } from "../cinematic/render-options";
import type { CinematicTimelineEntry } from "./cinematic-visuals";
import type { RenderOptions, TransitionType } from "../types/cinematic";

export interface RenderSceneCheckpoint { sceneIndex: number; inputHash: string; s3Key: string;contentHash?:string }
export interface AssemblyOptions extends RenderOptions {
  sceneCache?: RenderSceneCheckpoint[];
  onSceneComplete?: (checkpoint: RenderSceneCheckpoint) => Promise<void>;
  musicS3Key?: string;
  musicVolume?: number;
  enableTransitions?: boolean;
}

export async function assembleCinematicVideo(jobId: string, timeline: CinematicTimelineEntry[], voiceS3Key: string,
  tmpDir: string, onLog?: (msg: string) => void, options: AssemblyOptions = {}): Promise<string> {
  if (!timeline.length) throw new Error("Cannot assemble an empty timeline");
  const voicePath = path.join(tmpDir, "voice.mp3");
  fs.writeFileSync(voicePath, await downloadFromS3(voiceS3Key));
  const processedPaths: string[] = [];
  const available=await new Promise<Record<string,unknown>>((resolve,reject)=>ffmpeg.getAvailableFilters((error,filters)=>error?reject(error):resolve(filters)));
  const supportsXfade=!!available.xfade;
  if(!supportsXfade&&timeline.some(entry=>entry.scene.transition_type!=="cut"))onLog?.("This FFmpeg build uses fade-to-black transitions; install a current FFmpeg build for cross-dissolves.");
  const transitionDurations = timeline.map((entry, index) => supportsXfade && index < timeline.length - 1 && options.enableTransitions !== false && entry.scene.transition_type !== "cut"
    ? Math.min(0.35, (entry.end_sec - entry.start_sec) / 4, (timeline[index + 1].end_sec - timeline[index + 1].start_sec) / 4) : 0);
  for (let i = 0; i < timeline.length; i++) {
    options.signal?.throwIfAborted();
    const entry = timeline[i];
    const duration = entry.end_sec - entry.start_sec + transitionDurations[i];
    const inputHash = createHash("sha256").update(JSON.stringify({ version: 4, asset: entry.inputHash ?? entry.s3Key,
      camera: entry.scene.camera_direction, duration, output: resolveRenderOptions(options) })).digest("hex");
    const outPath = path.join(tmpDir, `cinematic_${i}.mp4`);
    const cached = options.sceneCache?.find((item) => item.inputHash === inputHash);
    let reused = false;
    if (cached) {
      try {
        fs.writeFileSync(outPath, await downloadFromS3(cached.s3Key));
        if(cached.contentHash&&createHash("sha256").update(fs.readFileSync(outPath)).digest("hex")!==cached.contentHash)throw new Error("Saved scene render changed");
        await verifyVideo(outPath, duration, options);
        reused = true;
        onLog?.(`Reusing rendered scene ${i + 1}`);
      } catch { onLog?.(`Saved render for scene ${i + 1} is invalid; rendering it again`); }
    }
    if (!reused) {
      // Timeline files belong to another process after a restart; durable references are authoritative.
      const sourcePath = path.join(tmpDir, `source_${i}.${entry.type === "clip" ? "mp4" : "png"}`);
      fs.writeFileSync(sourcePath, await downloadFromS3(entry.s3Key));
      onLog?.(`Rendering scene ${i + 1}/${timeline.length} at ${options.resolution ?? "1080p"}`);
      const render = entry.type === "clip" ? applyMotionEffectsToClip : applyMotionEffectsToImage;
      await render(sourcePath, outPath, duration, entry.scene.camera_direction, [], {...options,fadeInDuration:!supportsXfade&&i>0&&timeline[i-1].scene.transition_type!=="cut"?0.25:0,fadeOutDuration:!supportsXfade&&i<timeline.length-1&&entry.scene.transition_type!=="cut"?0.25:0});
      await verifyVideo(outPath, duration, options);
      const s3Key = `jobs/${jobId}/rendered-scenes/${i}-${inputHash.slice(0, 20)}.mp4`;
      await uploadFileToS3(s3Key, outPath, "video/mp4");
      await options.onSceneComplete?.({ sceneIndex: i, inputHash, s3Key,contentHash:createHash("sha256").update(fs.readFileSync(outPath)).digest("hex") });
      fs.rmSync(sourcePath, { force: true });
    }
    processedPaths.push(outPath);
  }
  const concatenatedPath = path.join(tmpDir, "concatenated.mp4");
  onLog?.("Combining scenes at their native output size");
  if (transitionDurations.some((duration) => duration > 0)) {
    await concatWithTransitions(processedPaths, timeline, transitionDurations, concatenatedPath, options);
  } else {
    const concatPath = path.join(tmpDir, "concat.txt");
    fs.writeFileSync(concatPath, processedPaths.map(concatFileLine).join("\n"));
    await runFFmpeg(ffmpeg().input(concatPath).inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c:v", "copy", "-an", "-movflags", "+faststart"]).output(concatenatedPath), undefined, options.signal);
  }
  const rawPath = path.join(tmpDir, "raw_video.mp4");
  let musicPath: string | undefined;
  if (options.musicS3Key) {
    musicPath = path.join(tmpDir, "licensed-music.audio");
    fs.writeFileSync(musicPath, await downloadFromS3(options.musicS3Key));
  }
  await mixCinematicAudio(concatenatedPath, voicePath, rawPath, musicPath, options);
  const s3Key = `jobs/${jobId}/raw_video.mp4`;
  await uploadFileToS3(s3Key, rawPath, "video/mp4");
  for (const file of [...processedPaths, concatenatedPath, voicePath, ...(musicPath ? [musicPath] : [])]) fs.rmSync(file, { force: true });
  return s3Key;
}

export function transitionFilter(type: TransitionType): string {
  const filters: Record<TransitionType, string> = { cut: "fade", fade: "fade", dissolve: "dissolve", wipe: "wipeleft",
    "blur transition": "fadeblack", "fade through fog": "fadegrays", "light flash": "fadewhite", "particle dissolve": "dissolve" };
  return filters[type];
}

async function concatWithTransitions(paths: string[], timeline: CinematicTimelineEntry[], durations: number[], output: string, options: AssemblyOptions): Promise<void> {
  const command = ffmpeg();
  paths.forEach((file) => command.input(file));
  const filters = paths.map((_, index) => `[${index}:v]settb=AVTB,setpts=PTS-STARTPTS[v${index}]`);
  let previous = "v0";
  let offset = 0;
  for (let i = 1; i < paths.length; i++) {
    offset += timeline[i - 1].end_sec - timeline[i - 1].start_sec;
    const next = `joined${i}`;
    filters.push(durations[i - 1] > 0
      ? `[${previous}][v${i}]xfade=transition=${transitionFilter(timeline[i - 1].scene.transition_type)}:duration=${durations[i - 1]}:offset=${offset}[${next}]`
      : `[${previous}][v${i}]concat=n=2:v=1:a=0[${next}]`);
    previous = next;
  }
  await runFFmpeg(command.complexFilter(filters).outputOptions(["-map", `[${previous}]`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-an", "-threads", "2", "-filter_complex_threads", "1", "-movflags", "+faststart"]).output(output), 30 * 60_000, options.signal);
}

async function mixCinematicAudio(video: string, voice: string, output: string, music: string | undefined, options: AssemblyOptions): Promise<void> {
  const command = ffmpeg().input(video).input(voice);
  if (music) {
    command.input(music).inputOptions(["-stream_loop", "-1"]);
    const volume = Math.max(0, Math.min(0.5, options.musicVolume ?? 0.15));
    command.complexFilter(["[1:a]asplit=2[speech][sidechain]", `[2:a]volume=${volume}[music]`,
      "[music][sidechain]sidechaincompress=threshold=0.025:ratio=8:attack=10:release=250[ducked]",
      "[speech][ducked]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[a]"]);
  }
  command.outputOptions(["-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-map", "0:v:0", "-map", music ? "[a]" : "1:a:0",
    "-threads", "2", "-movflags", "+faststart"]);
  await runFFmpeg(command.output(output), undefined, options.signal);
}

function verifyVideo(file: string, expectedDuration: number, options: RenderOptions): Promise<void> {
  return new Promise((resolve, reject) => ffmpeg.ffprobe(file, (error, metadata) => {
    if (error) return reject(error);
    const video = metadata.streams.find((stream) => stream.codec_type === "video");
    const { width, height } = resolveRenderOptions(options);
    if (video?.width !== width || video?.height !== height || Math.abs((metadata.format.duration ?? 0) - expectedDuration) > 0.15)
      return reject(new Error("Saved scene render does not match its output settings or duration"));
    resolve();
  }));
}
