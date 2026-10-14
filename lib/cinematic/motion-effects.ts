/** Native-resolution scene rendering. All scenes use identical stream parameters. */
import ffmpeg, { runFFmpeg } from "../ffmpeg";
import { resolveRenderOptions } from "./render-options";
import type { MotionEffectType, CameraDirection, RenderOptions } from "../types/cinematic";

export function generateZoomFilter(duration: number, direction: "in" | "out" = "in", intensity = 0.1, options: RenderOptions = {}): string {
  const { width, height, frameRate } = resolveRenderOptions(options);
  const frames = Math.max(1, Math.round(duration * frameRate));
  const zoom = direction === "in" ? `1+${intensity}*on/${frames}` : `1+${intensity}*(1-on/${frames})`;
  return `zoompan=z='${zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${width}x${height}:fps=${frameRate}`;
}

export function generatePanFilter(duration: number, direction: "left" | "right" | "up" | "down", intensity = 0.15, options: RenderOptions = {}): string {
  const { width, height, frameRate } = resolveRenderOptions(options);
  const frames = Math.max(1, Math.round(duration * frameRate));
  const progress = direction === "left" || direction === "up" ? `1-on/${frames}` : `on/${frames}`;
  const x = direction === "left" || direction === "right" ? `(iw-iw/zoom)*(${progress})` : "(iw-iw/zoom)/2";
  const y = direction === "up" || direction === "down" ? `(ih-ih/zoom)*(${progress})` : "(ih-ih/zoom)/2";
  return `zoompan=z='${1 + intensity}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=${frameRate}`;
}
export function generateParallaxFilter(duration: number, options: RenderOptions = {}): string { return generatePanFilter(duration, "right", 0.05, options); }
export function generateShakeFilter(intensity = 5): string { return `rotate=${Math.min(Math.abs(intensity), 10) / 1000}*sin(n*0.13):fillcolor=black`; }
export function generateVignetteFilter(intensity = 0.3): string { return `vignette=${Math.max(0.05, Math.min(1, intensity))}*PI`; }
export function generateGlowFilter(intensity = 1.5): string { return `gblur=sigma=${Math.max(0.1, Math.min(10, intensity))}:steps=1,eq=brightness=0.05`; }
export function generateChromaticAberrationFilter(intensity = 2): string { return `rgbashift=rh=${Math.round(intensity)}:bh=${-Math.round(intensity)}`; }
export function generateDepthBlurFilter(intensity = 3): string { return `gblur=sigma=${Math.max(0.1, Math.min(20, intensity))}:steps=1`; }

export function getCameraMotionEffect(cameraDirection: CameraDirection, duration: number, options: RenderOptions = {}): string[] {
  if (cameraDirection === "static") return [];
  if (cameraDirection === "pan left") return [generatePanFilter(duration, "left", 0.08, options)];
  if (cameraDirection === "pan right" || cameraDirection === "orbit") return [generatePanFilter(duration, "right", 0.08, options)];
  if (cameraDirection === "crane up") return [generatePanFilter(duration, "up", 0.08, options)];
  if (cameraDirection === "crane down") return [generatePanFilter(duration, "down", 0.08, options)];
  return [generateZoomFilter(duration, cameraDirection.includes("backward") || cameraDirection.includes("out") ? "out" : "in", 0.05, options)];
}

export function sceneVideoFilters(duration: number, camera: CameraDirection, image: boolean, effects: MotionEffectType[], options: RenderOptions = {}): string[] {
  const { width, height, frameRate } = resolveRenderOptions(options);
  const filters = [`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`, "setsar=1"];
  const cameraFilters=getCameraMotionEffect(camera,duration,options);
  filters.push(...(image?cameraFilters:cameraFilters.map(filter=>filter.replace(/:d=\d+/,":d=1"))));
  if (effects.includes("vignette")) filters.push(generateVignetteFilter());
  if (effects.includes("glow_effect")) filters.push("eq=brightness=0.05:contrast=1.1");
  if(options.fadeInDuration)filters.push(`fade=t=in:st=0:d=${options.fadeInDuration}`);
  if(options.fadeOutDuration)filters.push(`fade=t=out:st=${Math.max(0,duration-options.fadeOutDuration)}:d=${options.fadeOutDuration}`);
  filters.push(`fps=${frameRate}`, "format=yuv420p", "setpts=PTS-STARTPTS");
  return filters;
}

function renderScene(input: string, output: string, duration: number, camera: CameraDirection, image: boolean, effects: MotionEffectType[], options: RenderOptions): Promise<void> {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new Error("Invalid scene render duration");
  const { frameRate } = resolveRenderOptions(options);
  const command = ffmpeg(input).inputOptions(image ? ["-loop", "1", "-framerate", String(frameRate)] : ["-stream_loop", "-1"])
    .videoFilters(sceneVideoFilters(duration, camera, image, effects, options))
    .outputOptions(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(frameRate), "-t", String(duration), "-an", "-threads", "2", "-max_muxing_queue_size", "512"])
    .output(output);
  return runFFmpeg(command, Math.max(120_000, duration * 15_000), options.signal);
}

export function applyMotionEffectsToImage(imagePath: string, outputPath: string, duration: number, camera: CameraDirection, effects: MotionEffectType[] = [], options: RenderOptions = {}): Promise<void> {
  return renderScene(imagePath, outputPath, duration, camera, true, effects, options);
}
export function applyMotionEffectsToClip(clipPath: string, outputPath: string, duration: number, camera: CameraDirection, effects: MotionEffectType[] = [], options: RenderOptions = {}): Promise<void> {
  return renderScene(clipPath, outputPath, duration, camera, false, effects, options);
}
export function addFogOverlay(inputPath: string, outputPath: string, intensity = 0.3): Promise<void> {
  return runFFmpeg(ffmpeg(inputPath).videoFilters(`eq=brightness=${Math.max(0, Math.min(0.15, intensity / 4))}:contrast=0.95`)
    .outputOptions(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "-threads", "2"]).output(outputPath));
}
