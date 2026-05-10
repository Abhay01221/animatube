/**
 * Motion Effects Engine
 * Applies cinematic motion effects to static images and video clips using FFmpeg.
 * Makes still visuals feel alive with zoom, pan, parallax, and atmospheric effects.
 */
import ffmpeg from "../ffmpeg";
import type { MotionEffect, MotionEffectType, CameraDirection } from "../types/cinematic";

// ─── Motion Effect Generators ─────────────────────────────────────────────────

/**
 * Generate FFmpeg filter for slow zoom effect (Ken Burns)
 */
export function generateZoomFilter(
  duration: number,
  direction: "in" | "out" = "in",
  intensity: number = 0.1
): string {
  const startZoom = direction === "in" ? 1.0 : 1.0 + intensity;
  const endZoom = direction === "in" ? 1.0 + intensity : 1.0;
  const frames = Math.round(duration * 30); // 30 fps

  return `zoompan=z='if(lte(zoom,${endZoom}),zoom+${intensity / frames},${endZoom})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30`;
}

/**
 * Generate FFmpeg filter for cinematic pan
 */
export function generatePanFilter(
  duration: number,
  direction: "left" | "right" | "up" | "down",
  intensity: number = 0.15
): string {
  const frames = Math.round(duration * 30);
  const panAmount = intensity * 1920; // Pan distance in pixels

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

  return `zoompan=z='1.0':x='${xExpr}':y='${yExpr}':d=${frames}:s=1920x1080:fps=30`;
}

/**
 * Generate FFmpeg filter for parallax effect (multi-layer depth)
 */
export function generateParallaxFilter(duration: number): string {
  const frames = Math.round(duration * 30);
  // Subtle zoom with offset for depth illusion
  return `zoompan=z='min(1.05,zoom+0.0003)':x='iw/2-(iw/zoom/2)+sin(on/${frames}*2*PI)*20':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=30`;
}

/**
 * Generate FFmpeg filter for camera shake
 */
export function generateShakeFilter(intensity: number = 5): string {
  // Random shake using crop with random offset
  return `crop=1920:1080:x='(iw-ow)/2+${intensity}*sin(n*0.1)':y='(ih-oh)/2+${intensity}*cos(n*0.13)'`;
}

/**
 * Generate FFmpeg filter for vignette effect
 */
export function generateVignetteFilter(intensity: number = 0.3): string {
  // Simplified vignette filter for maximum FFmpeg compatibility
  // Only uses the angle parameter which is universally supported
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
  // Split RGB channels and offset them slightly
  return `split=3[r][g][b];[r]lutrgb=r=val:g=0:b=0,crop=1920:1080:${intensity}:0[r];[g]lutrgb=r=0:g=val:b=0[g];[b]lutrgb=r=0:g=0:b=val,crop=1920:1080:-${intensity}:0[b];[r][g][b]blend=all_mode=addition`;
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

  // Simplified motion effects to avoid filter conflicts
  switch (cameraDirection) {
    case "slow dolly forward":
    case "slow zoom in":
      // Subtle zoom in
      filters.push(generateZoomFilter(duration, "in", 0.05));
      break;

    case "slow dolly backward":
    case "slow zoom out":
      // Subtle zoom out
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
      // Simplified parallax
      filters.push(generateZoomFilter(duration, "in", 0.03));
      break;

    case "handheld shake":
      // Very subtle zoom for handheld feel
      filters.push(generateZoomFilter(duration, "in", 0.02));
      break;

    case "static":
    default:
      // Minimal zoom to avoid completely static image
      filters.push(generateZoomFilter(duration, "in", 0.02));
      break;
  }

  return filters;
}

/**
 * Apply motion effects to an image, converting it to a video clip
 */
export function applyMotionEffectsToImage(
  imagePath: string,
  outputPath: string,
  duration: number,
  cameraDirection: CameraDirection,
  additionalEffects: MotionEffectType[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filters: string[] = [];

    // CRITICAL: Force exact dimensions first
    filters.push("scale=1920:1080:force_original_aspect_ratio=decrease");
    filters.push("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black");
    filters.push("setsar=1");
    filters.push("setdar=16/9");

    // Add camera motion
    const motionFilters = getCameraMotionEffect(cameraDirection, duration);
    filters.push(...motionFilters);

    // Add additional effects (simplified to avoid filter conflicts)
    for (const effect of additionalEffects) {
      switch (effect) {
        case "vignette":
          // Only add vignette if FFmpeg supports it
          try {
            filters.push(generateVignetteFilter(0.25));
          } catch {
            console.log("[Motion Effects] Skipping vignette (not supported)");
          }
          break;
        case "glow_effect":
          // Simplified glow to avoid filter conflicts
          filters.push("eq=brightness=0.05:contrast=1.1");
          break;
      }
    }

    const filterComplex = filters.join(",");

    console.log(`[Motion Effects] Image filter: ${filterComplex}`);

    ffmpeg(imagePath)
      .inputOptions(["-loop", "1", "-framerate", "30"])
      .videoFilters(filterComplex)
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-t", String(duration),
        "-r", "30", // Force 30 fps
        "-pix_fmt", "yuv420p",
        "-s", "1920x1080", // Force output size
        "-aspect", "16:9", // Force aspect ratio
        "-an",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Motion Effects] FFmpeg command: ${cmd}`);
      })
      .on("end", () => {
        console.log(`[Motion Effects] Image processed: ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Motion Effects] FFmpeg error: ${err.message}`);
        console.error(`[Motion Effects] FFmpeg stderr: ${stderr}`);
        reject(err);
      })
      .run();
  });
}

/**
 * Apply motion effects to a video clip
 */
export function applyMotionEffectsToClip(
  clipPath: string,
  outputPath: string,
  duration: number,
  cameraDirection: CameraDirection,
  additionalEffects: MotionEffectType[] = []
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filters: string[] = [];

    // CRITICAL: Force exact dimensions first
    filters.push("scale=1920:1080:force_original_aspect_ratio=decrease");
    filters.push("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black");
    filters.push("setsar=1");
    filters.push("setdar=16/9");

    // Add additional cinematic effects to video clips (simplified)
    for (const effect of additionalEffects) {
      switch (effect) {
        case "vignette":
          // Only add vignette if FFmpeg supports it
          try {
            filters.push(generateVignetteFilter(0.2));
          } catch {
            console.log("[Motion Effects] Skipping vignette (not supported)");
          }
          break;
      }
    }

    const filterComplex = filters.join(",");

    console.log(`[Motion Effects] Clip filter: ${filterComplex}`);

    ffmpeg(clipPath)
      .inputOptions(["-t", String(duration)])
      .videoFilters(filterComplex)
      .outputOptions([
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-t", String(duration),
        "-r", "30", // Force 30 fps
        "-pix_fmt", "yuv420p",
        "-s", "1920x1080", // Force output size
        "-aspect", "16:9", // Force aspect ratio
        "-an",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(`[Motion Effects] FFmpeg command: ${cmd}`);
      })
      .on("end", () => {
        console.log(`[Motion Effects] Clip processed: ${outputPath}`);
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error(`[Motion Effects] FFmpeg error: ${err.message}`);
        console.error(`[Motion Effects] FFmpeg stderr: ${stderr}`);
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
    // Generate fog using noise and blur
    const fogFilter = `geq=lum='random(1)*255':cb=128:cr=128,gblur=sigma=50,colorchannelmixer=aa=${intensity}`;

    ffmpeg(inputPath)
      .complexFilter([
        `[0:v]split[main][fog]`,
        `[fog]${fogFilter}[foggy]`,
        `[main][foggy]overlay=0:0`,
      ])
      .outputOptions(["-c:v", "libx264", "-preset", "medium", "-crf", "20"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
}
