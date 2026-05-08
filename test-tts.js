const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const path = require("path");
const fs = require("fs");

async function test() {
  try {
    const tts = new MsEdgeTTS();

    await tts.setMetadata(
      "en-US-AriaNeural",
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    // Create output directory
    const outputDir = path.join(__dirname, "test-output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // toFile expects a directory path, not a file path
    await tts.toFile(
      outputDir,
      "Hello world, this is a test of the Microsoft Edge TTS system."
    );

    // The file will be created as audio.mp3 in the output directory
    const audioFile = path.join(outputDir, "audio.mp3");
    if (fs.existsSync(audioFile)) {
      console.log("MP3 generated successfully:", audioFile);
      const stats = fs.statSync(audioFile);
      console.log("File size:", (stats.size / 1024).toFixed(2), "KB");
    } else {
      console.error("Audio file was not created");
    }
  } catch (err) {
    console.error("TTS ERROR:");
    console.error(err);
  }
}

test();