/**
 * FFmpeg helper — wraps fluent-ffmpeg with the bundled ffmpeg and ffprobe binaries.
 * All FFmpeg operations go through this module.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

// Point fluent-ffmpeg at the bundled binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Log paths for debugging
console.log("[FFmpeg] FFmpeg path:", ffmpegInstaller.path);
console.log("[FFmpeg] FFprobe path:", ffprobeInstaller.path);

export default ffmpeg;
export { ffmpeg };
