/**
 * Image resize + VLM optimization
 *
 * Downscale images before sending to VLM to reduce token cost.
 * Supports auto-escalation when resolution is insufficient.
 */
import { PNG } from "pngjs";

export type ResolutionPreset = "low" | "medium" | "high" | "full";

export const RESOLUTION_PRESETS: Record<ResolutionPreset, { maxWidth: number; maxHeight: number }> = {
  low: { maxWidth: 375, maxHeight: 320 },      // mobile viewport width. ~130 tokens
  medium: { maxWidth: 640, maxHeight: 480 },    // breakpoint boundary. ~200 tokens
  high: { maxWidth: 1280, maxHeight: 900 },     // desktop viewport. ~500 tokens
  full: { maxWidth: 4096, maxHeight: 4096 },    // original size
};

/**
 * Select the optimal resolution preset for a given viewport width.
 * Returns the smallest preset with at least half the viewport width.
 */
export function resolveResolutionForViewport(
  viewportWidth: number,
  maxPreset: ResolutionPreset = "high",
): ResolutionPreset {
  const order: ResolutionPreset[] = ["low", "medium", "high", "full"];
  const maxIdx = order.indexOf(maxPreset);

  for (let i = 0; i <= maxIdx; i++) {
    const preset = RESOLUTION_PRESETS[order[i]];
    // Sufficient if image width >= half of viewport
    if (preset.maxWidth >= viewportWidth / 2) return order[i];
  }

  return maxPreset;
}

export interface ResizeOptions {
  /** Preset or custom size */
  resolution?: ResolutionPreset | { maxWidth: number; maxHeight: number };
}

/** Resize PNG buffer to fit within the given size. Preserves aspect ratio. */
export function resizePngBuffer(pngBuffer: Buffer, options: ResizeOptions = {}): Buffer {
  const preset = typeof options.resolution === "string"
    ? RESOLUTION_PRESETS[options.resolution]
    : options.resolution ?? RESOLUTION_PRESETS.medium;

  const src = PNG.sync.read(pngBuffer);

  if (src.width <= preset.maxWidth && src.height <= preset.maxHeight) {
    return pngBuffer; // already small enough
  }

  const scale = Math.min(preset.maxWidth / src.width, preset.maxHeight / src.height);
  const targetW = Math.round(src.width * scale);
  const targetH = Math.round(src.height * scale);

  const dst = new PNG({ width: targetW, height: targetH });
  const xRatio = src.width / targetW;
  const yRatio = src.height / targetH;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), src.width - 1);
      const srcY = Math.min(Math.floor(y * yRatio), src.height - 1);
      const si = (srcY * src.width + srcX) * 4;
      const di = (y * targetW + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }

  return Buffer.from(PNG.sync.write(dst));
}

/** Read dimensions from PNG IHDR chunk (no full decode needed) */
function readPngDimensions(buf: Buffer): { width: number; height: number } {
  // PNG header: 8-byte signature, then IHDR chunk: 4-byte length, 4-byte type, 4-byte width, 4-byte height
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // Fallback: full decode
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height };
}

/** Resize a base64 PNG to the specified resolution. Returns base64. */
export function resizeBase64Png(base64: string, options: ResizeOptions = {}): string {
  const preset = typeof options.resolution === "string"
    ? RESOLUTION_PRESETS[options.resolution]
    : options.resolution ?? RESOLUTION_PRESETS.medium;

  const buf = Buffer.from(base64, "base64");
  const { width, height } = readPngDimensions(buf);

  // Skip round-trip if already small enough
  if (width <= preset.maxWidth && height <= preset.maxHeight) {
    return base64;
  }

  const resized = resizePngBuffer(buf, options);
  return resized.toString("base64");
}

/** Get image dimensions */
export function getImageDimensions(base64: string): { width: number; height: number } {
  const buf = Buffer.from(base64, "base64");
  return readPngDimensions(buf);
}
