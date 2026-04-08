/**
 * PNG I/O utilities
 *
 * Low-level PNG decode/encode using pngjs.
 * Used by heatmap.ts and other modules that need raw pixel data.
 */
import { readFile, writeFile } from "node:fs/promises";

export interface PngData {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Crop or pad an image to the target dimensions.
 * Only handles the common region; overflow is zero-filled.
 */
export function cropImage(img: PngData, w: number, h: number): PngData {
  if (img.width === w && img.height === h) return img;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcOffset = y * img.width * 4;
    const dstOffset = y * w * 4;
    data.set(img.data.subarray(srcOffset, srcOffset + w * 4), dstOffset);
  }
  return { width: w, height: h, data };
}

/**
 * Read a PNG file and return RGBA pixel data.
 */
export async function decodePng(path: string): Promise<PngData> {
  const { PNG } = await import("pngjs");
  const buffer = await readFile(path);
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

/**
 * Write RGBA pixel data to a PNG file.
 */
export async function encodePng(
  path: string,
  data: PngData
): Promise<void> {
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: data.width, height: data.height });
  Buffer.from(data.data.buffer, data.data.byteOffset, data.data.byteLength).copy(png.data);
  const buffer = PNG.sync.write(png);
  await writeFile(path, buffer);
}
