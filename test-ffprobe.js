const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
const path = require("path");

// Configure paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

console.log("FFmpeg path:", ffmpegInstaller.path);
console.log("FFprobe path:", ffprobeInstaller.path);

// Test ffprobe on the generated audio file
const audioFile = path.join(__dirname, "test-output", "audio.mp3");

console.log("\nTesting ffprobe on:", audioFile);

ffmpeg.ffprobe(audioFile, (err, metadata) => {
  if (err) {
    console.error("FFprobe ERROR:", err);
    process.exit(1);
  }
  
  console.log("\n✅ FFprobe working successfully!");
  console.log("Duration:", metadata.format.duration, "seconds");
  console.log("Format:", metadata.format.format_name);
  console.log("Bit rate:", metadata.format.bit_rate);
  console.log("Size:", (metadata.format.size / 1024).toFixed(2), "KB");
});
