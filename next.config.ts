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

  // Exclude worker-only packages from the Next.js bundle
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "ioredis",
    "bullmq",
  ],

  // Use empty turbopack config to silence the webpack warning
  turbopack: {},
};

export default nextConfig;
