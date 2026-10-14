import type { RenderOptions } from "../types/cinematic";

export function resolveRenderOptions(options: RenderOptions = {}) {
  const vertical = options.aspectRatio === "9:16";
  const shortSide = options.resolution === "720p" ? 720 : 1080;
  const longSide = options.resolution === "720p" ? 1280 : 1920;
  return {
    width: vertical ? shortSide : longSide,
    height: vertical ? longSide : shortSide,
    frameRate: options.frameRate ?? 30,
    aspectRatio: vertical ? "9:16" as const : "16:9" as const,
  };
}

export function resolveSceneDurations(planned: number[], total: number, measured?: number[]): number[] {
  if (!planned.length || !Number.isFinite(total) || total <= 0) throw new Error("Invalid audio timeline");
  const useMeasured = measured?.length === planned.length && measured.every((n) => Number.isFinite(n) && n > 0);
  const durations = useMeasured ? measured! : planned;
  if (durations.some((n) => !Number.isFinite(n) || n <= 0)) throw new Error("Scene durations must be positive");
  const sum = durations.reduce((acc, n) => acc + n, 0);
  return durations.map((n) => n * total / sum);
}

export function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function concatFileLine(filePath: string): string {
  return `file '${filePath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;
}
