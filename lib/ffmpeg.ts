/**
 * FFmpeg helper — wraps fluent-ffmpeg with the bundled ffmpeg and ffprobe binaries.
 * All FFmpeg operations go through this module.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

// Point fluent-ffmpeg at the bundled binaries
ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH||ffmpegInstaller.path);
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH||ffprobeInstaller.path);

// Log paths for debugging
console.log("[FFmpeg] FFmpeg path:", ffmpegInstaller.path);
console.log("[FFmpeg] FFprobe path:", ffprobeInstaller.path);

export default ffmpeg;
export { ffmpeg };

/** Bound encodes and terminate their process when a job is cancelled. */
export function runFFmpeg(command: ffmpeg.FfmpegCommand, timeoutMs = 15 * 60_000, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => { command.kill("SIGKILL"); finish(new Error("Video processing cancelled")); };
    const timer = setTimeout(() => { command.kill("SIGKILL"); finish(new Error("Video processing exceeded its time limit")); }, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    command.on("end", () => finish()).on("error", (error) => finish(error)).run();
  });
}
