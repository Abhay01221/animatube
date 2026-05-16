import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow YouTube thumbnail images
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.s3.*.amazonaws.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  // Exclude worker-only packages from the Next.js bundle.
  // These packages use Node.js-specific APIs (WebSocket, native modules)
  // and must never be bundled by Next.js's webpack/turbopack.
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "ioredis",
    "bullmq",
    // msedge-tts and its WebSocket dependencies must resolve to Node.js
    // entry points, not browser shims. Without this, isomorphic-ws picks
    // up browser.js instead of node.js and WebSocket connections fail.
    "msedge-tts",
    "ws",
    "isomorphic-ws",
  ],

  // Use empty turbopack config to silence the webpack warning
  turbopack: {},
};

export default nextConfig;
