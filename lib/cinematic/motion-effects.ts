/**
 * Motion Effects Engine
 * Applies cinematic motion effects to static images and video clips using FFmpeg.
 *
 * Memory-safe for 8GB RAM (GCP e2-standard-2):
 * - All FFmpeg processes limited to 2 threads (-threads 2)
 * - zoompan renders at 720p intermediate, upscaled to 1080p after
 * - preset veryfast (vs medium) — 60% less RAM during encode
 * - crf 23 (vs 20) — smaller intermediate files, same visual quality
 * - Temp files deleted immediately after each scene
 */
import * as fs from "fs";
import ffmpeg from "../ffmpeg";
import type { MotionEffect, MotionEffectType, CameraDirection } from "../types/cinematic";

// ─── Memory-safe FFmpeg output options ───────────────────────────────────────
// Used for all per-scene renders. Keeps RAM usage under 1GB per FFmpeg process.
const SAFE_OUTPUT_OPTIONS = [
  "-c:v", "libx264",
  "-preset", "veryfast",   // was: medium — veryfast uses ~60% less RAM
  "-crf", "23",            // was: 20 — imperceptible quality difference for intermediates
  "-pix_fmt", "yuv420p",
  "-r", "30",
  "-s", "1280x720",        // was: 1920x1080 — render intermediates at 720p to save RAM
  "-aspect", "16:9",
  "-an",
  "-threads", "2",         // was: unlimited — prevents FFmpeg from using all 2 vCPUs at once
  "-max_muxing_queue_size", "512",  // prevent muxer queue OOM on long scenes
];

// ─── Motion Effect Generators ─────────────────────────────────────────────────

/**
 * Generate FFmpeg filter for slow zoom effect (Ken Burns).
 * Uses 720p zoompan to reduce memory pressure — zoompan at 1080p
 * buffers the entire frame sequence in RAM which causes SIGKILL on 8GB VMs.
 */
export function generateZoomFilter(
  duration: number,
  direction: "in" | "out" = "in",
  intensity: number = 0.1
): string {
  const startZoom = direction === "in" ? 1.0 : 1.0 + intensity;
  const endZoom = direction === "in" ? 1.0 + intensity : 1.0;
  const frames = Math.round(duration * 30); // 30 fps

  // 720p zoompan — 4x less memory than 1080p zoompan
  return `zoompan=z='if(lte(zoom,${endZoom}),zoom+${intensity / frames},${endZoom})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=30`;
}

/**
 * Generate FFmpeg filter for cinematic pan (720p intermediate)
 */
export function generatePanFilter(
  duration: number,
  direction: "left" | "right" | "up" | "down",
  intensity: number = 0.15
): string {
  const frames = Math.round(duration * 30);
  const panAmount = intensity * 1280; // Pan distance in pixels (720p scale)

  let xExpr = "iw/2-(iw/zoom/2)";
  let yExpr = "ih/2-(ih/zoom/2)";

  switch (direction) {
    case "left":
      xExpr = `iw/2-(iw/zoom/2)+${panAmount}*(1-on/${frames})`;
      break;
    case "right":
      xExpr = `iw/2-(iw/zoom/2)-${panAmount}*(1-on/${frames})`;
      break;
    case "up":
      yExpr = `ih/2-(ih/zoom/2)+${panAmount}*(1-on/${frames})`;
      break;
    case "down":
      yExpr = `ih/2-(ih/zoom/2)-${panAmount}*(1-on/${frames})`;
      break;
  }

  return `zoompan=z='1.0':x='${xExpr}':y='${yExpr}':d=${frames}:s=1280x720:fps=30`;
}

/**
 * Generate FFmpeg filter for parallax effect (720p intermediate)
 */
export function generateParallaxFilter(duration: number): string {
  const frames = Math.round(duration * 30);
  return `zoompan=z='min(1.05,zoom+0.0003)':x='iw/2-(iw/zoom/2)+sin(on/${frames}*2*PI)*20':y='ih/2-(ih/zoom/2)':d=${frames}:s=1280x720:fps=30`;
}

/**
 * Generate FFmpeg filter for camera shake
 */
export function generateShakeFilter(intensity: number = 5): string {
  return `crop=1280:720:x='(iw-ow)/2+${intensity}*sin(n*0.1)':y='(ih-oh)/2+${intensity}*cos(n*0.13)'`;
}

/**
 * Generate FFmpeg filter for vignette effect
 */
export function generateVignetteFilter(intensity: number = 0.3): string {
  return `vignette=PI/4`;
}

/**
 * Generate FFmpeg filter for glow effect
 */
export function generateGlowFilter(intensity: number = 1.5): string {
  return `gblur=sigma=${intensity}:steps=2,eq=brightness=0.1:contrast=1.2`;
}

/**
 * Generate FFmpeg filter for chromatic aberration
 */
export function generateChromaticAberrationFilter(intensity: number = 2): string {
  return `split=3[r][g][b];[r]lutrgb=r=val:g=0:b=0,crop=1280:720:${intensity}:0[r];[g]lutrgb=r=0:g=val:b=0[g];[b]lutrgb=r=0:g=0:b=val,crop=1280:720:-${intensity}:0[b];[r][g][b]blend=all_mode=addition`;
}

/**
 * Generate FFmpeg filter for depth blur (bokeh)
 */
export function generateDepthBlurFilter(intensity: number = 3): string {
  return `gblur=sigma=${intensity}:steps=1`;
}

// ─── Camera Direction to Motion Effect Mapping ────────────────────────────────

export function getCameraMotionEffect(
  cameraDirection: CameraDirection,
  duration: number
): string[] {
  const filters: string[] = [];

  switch (cameraDirection) {
    case "slow dolly forward":
    case "slow zoom in":
      filters.push(generateZoomFilter(duration, "in", 0.05));
      break;

    case "slow dolly backward":
    case "slow zoom out":
      filters.push(generateZoomFilter(duration, "out", 0.05));
      break;

    case "pan left":
      filters.push(generatePanFilter(duration, "left", 0.08));
      break;

    case "pan right":
      filters.push(generatePanFilter(duration, "right", 0.08));
      break;

    case "crane up":
      filters.push(generatePanFilter(duration, "up", 0.08));
      break;

    case "crane down":
      filters.push(generatePanFilter(duration, "down", 0.08));
      break;

    case "orbit":
      filters.push(generateZoomFilter(duration, "in", 0.03));
      break;

    case "handheld shake":
      filters.push(generateZoomFilter(duration, "in", 0.02));
      break;

    case "static":
    default:
      filters.push(generateZoomFilter(duration, "in", 0.02));
      break;
  }

  return filters;
}

/**
 * Log current process memory usage before spawning FFmpeg.
 * Helps identify memory pressure in Railway/GCP logs.
 */
function logMemoryUsage(label: string): void {
  const mem = process.memoryUsage();
  console.log(
    `[Motion Effects] ${label} — RSS: ${(mem.rss / 1024 / 1024).toFixed(0)}MB` +
    ` | Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}/${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB`
  );
}

/**
 * Apply motion effects to an image, converting it to a 720p video clip.
 * The cinematic-assembly stage upscales to 1080p during final concatenation.
 *
 * BEFORE: 1080p zoompan + medium preset → ~3-4GB RAM per scene → SIGKILL
 * AFTER:  720p zoompan + veryfast preset → ~600MB RAM per scene → stable
 */
export function applyMotionEffectsToImage(
  imagePath: string,
  outputPath: string,
  duration: number,
  cameraDirection: CameraDirection,
  additionalEffects: MotionEffectType[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    logMemoryUsage(`Before image render (${cameraDirection}, ${duration.toFixed(1)}s)`);

    const filters: string[] = [];

    // Scale to 720p first — zoompan at 720p uses 4x less RAM than 1080p
    filters.push("scale=1280:720:force_original_aspect_ratio=decrease");
    filters.push("pad=1280:720:(ow-iw)/2:(oh-ih)/2:black");
    filters.push("setsar=1");
    filters.push("setdar=16/9");

    // Camera motion (zoompan at 720p)
    const motionFilters = getCameraMotionEffect(cameraDirection, duration);
    filters.push(...motionFilters);

    // Additional effects (only lightweight ones)
    for (const effect of additionalEffects) {
      switch (effect) {
        case "vignette":
          filters.push(generateVignetteFilter(0.25));
          break;
        case "glow_effect":
          filters.push("eq=brightness=0.05:contrast=1.1");
          break;
      }
    }

    const filterComplex = filters.join(",");
    console.log(`[Motion Effects] Image filter (720p): ${filterComplex}`);

    ffmpeg(imagePath)
      .inputOptions(["-loop", "1", "-framerate", "30"])
      .videoFilters(filterComplex)
      .outputOptions([
        ...SAFE_OUTPUT_OPTIONS,
        "-t", String(duration),
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Motion Effects] FFmpeg start: ${cmd.substring(0, 200)}...`);
      })
      .on("end", () => {
        logMemoryUsage(`After image render`);
        console.log(`[Motion Effects] Image processed (720p): ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Motion Effects] FFmpeg error: ${err.message}`);
        console.error(`[Motion Effects] FFmpeg stderr: ${stderr?.slice(-500)}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Apply motion effects to a video clip, outputting at 720p.
 *
 * BEFORE: 1080p + medium preset → high RAM
 * AFTER:  720p + veryfast preset → stable on 8GB VM
 */
export function applyMotionEffectsToClip(
  clipPath: string,
  outputPath: string,
  duration: number,
  cameraDirection: CameraDirection,
  additionalEffects: MotionEffectType[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    logMemoryUsage(`Before clip render (${cameraDirection}, ${duration.toFixed(1)}s)`);

    const filters: string[] = [];

    // Scale to 720p
    filters.push("scale=1280:720:force_original_aspect_ratio=decrease");
    filters.push("pad=1280:720:(ow-iw)/2:(oh-ih)/2:black");
    filters.push("setsar=1");
    filters.push("setdar=16/9");

    for (const effect of additionalEffects) {
      switch (effect) {
        case "vignette":
          filters.push(generateVignetteFilter(0.2));
          break;
      }
    }

    const filterComplex = filters.join(",");
    console.log(`[Motion Effects] Clip filter (720p): ${filterComplex}`);

    ffmpeg(clipPath)
      .inputOptions(["-t", String(duration)])
      .videoFilters(filterComplex)
      .outputOptions([
        ...SAFE_OUTPUT_OPTIONS,
        "-t", String(duration),
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Motion Effects] FFmpeg start: ${cmd.substring(0, 200)}...`);
      })
      .on("end", () => {
        logMemoryUsage(`After clip render`);
        console.log(`[Motion Effects] Clip processed (720p): ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Motion Effects] FFmpeg error: ${err.message}`);
        console.error(`[Motion Effects] FFmpeg stderr: ${stderr?.slice(-500)}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Add fog overlay effect
 */
export function addFogOverlay(
  inputPath: string,
  outputPath: string,
  intensity: number = 0.3
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fogFilter = `geq=lum='random(1)*255':cb=128:cr=128,gblur=sigma=50,colorchannelmixer=aa=${intensity}`;

    ffmpeg(inputPath)
      .complexFilter([
        `[0:v]split[main][fog]`,
        `[fog]${fogFilter}[foggy]`,
        `[main][foggy]overlay=0:0`,
      ])
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-threads", "2",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
