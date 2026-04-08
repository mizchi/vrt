import type { VrtDiff, VrtSnapshot, DiffRegion, DiffRegionType, DiffReport, ShiftRegion } from "./types.ts";
import { type PngData, cropImage, decodePng, encodePng } from "./png-utils.ts";

// ---- Shared diff pipeline ----

interface PixelDiffResult {
  diffOutput: Uint8Array;
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  threshold: number;
  resizedBaseline: PngData;
  resizedCurrent: PngData;
}

async function runPixelDiff(
  baselinePath: string,
  screenshotPath: string,
  testId: string,
  opts: { threshold?: number; outputDir?: string; skipHeatmap?: boolean },
): Promise<PixelDiffResult & { heatmapPath?: string }> {
  const pixelmatch = (await import("pixelmatch")).default;
  const baseline = await decodePng(baselinePath);
  const current = await decodePng(screenshotPath);

  let resizedBaseline = baseline;
  let resizedCurrent = current;
  let overflowPixels = 0;

  if (baseline.width !== current.width || baseline.height !== current.height) {
    const commonW = Math.min(baseline.width, current.width);
    const commonH = Math.min(baseline.height, current.height);
    overflowPixels =
      Math.max(baseline.width, current.width) * Math.max(baseline.height, current.height)
      - commonW * commonH;
    resizedBaseline = cropImage(baseline, commonW, commonH);
    resizedCurrent = cropImage(current, commonW, commonH);
  }

  const width = resizedBaseline.width;
  const height = resizedBaseline.height;
  const totalPixels = width * height + overflowPixels;
  const diffOutput = new Uint8Array(width * height * 4);
  const threshold = opts.threshold ?? 0.1;

  const diffPixels = overflowPixels + pixelmatch(
    resizedBaseline.data, resizedCurrent.data, diffOutput, width, height, { threshold },
  );

  let heatmapPath: string | undefined;
  if (opts.outputDir && diffPixels > 0 && !opts.skipHeatmap) {
    const safeName = testId.replace(/[/\\:]/g, "_");
    heatmapPath = `${opts.outputDir}/${safeName}_heatmap.png`;
    await encodePng(heatmapPath, { width, height, data: diffOutput });
  }

  return { diffOutput, width, height, diffPixels, totalPixels, threshold, resizedBaseline, resizedCurrent, heatmapPath };
}

// ---- Public API ----

/**
 * Compare two screenshots pixel-by-pixel and generate a diff heatmap.
 */
export async function compareScreenshots(
  snapshot: VrtSnapshot,
  opts: {
    threshold?: number;
    outputDir?: string;
    skipHeatmap?: boolean;
  } = {}
): Promise<VrtDiff | null> {
  if (!snapshot.baselinePath) return null;

  const r = await runPixelDiff(snapshot.baselinePath, snapshot.screenshotPath, snapshot.testId, opts);
  const regions = detectDiffRegions(r.diffOutput, r.width, r.height);

  return {
    snapshot,
    diffPixels: r.diffPixels,
    totalPixels: r.totalPixels,
    diffRatio: r.diffPixels / r.totalPixels,
    heatmapPath: r.heatmapPath,
    regions,
  };
}

/**
 * Grid-based diff region detection.
 * Splits image into cells and clusters cells exceeding the diff threshold.
 */
function detectDiffRegions(
  diffData: Uint8Array,
  width: number,
  height: number,
  cellSize: number = 32
): DiffRegion[] {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const grid = new Uint32Array(cols * rows);

  // Count diff pixels per cell
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // pixelmatch diff: changed = red (R=255,G=0), unchanged = white (R=255,G=255)
      if (diffData[idx + 1] < 128) {
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        grid[row * cols + col]++;
      }
    }
  }

  // Merge adjacent diff cells into bounding rectangles
  const visited = new Uint8Array(cols * rows);
  const regions: DiffRegion[] = [];
  const minPixels = 4; // noise threshold

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (visited[i] || grid[i] < minPixels) continue;

      // BFS cluster detection
      let minC = c,
        maxC = c,
        minR = r,
        maxR = r;
      let totalDiff = 0;
      const queue = [i];
      visited[i] = 1;

      while (queue.length > 0) {
        const ci = queue.shift()!;
        const cr = Math.floor(ci / cols);
        const cc = ci % cols;
        totalDiff += grid[ci];
        minC = Math.min(minC, cc);
        maxC = Math.max(maxC, cc);
        minR = Math.min(minR, cr);
        maxR = Math.max(maxR, cr);

        // 4-connected neighbors
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const ni = nr * cols + nc;
          if (!visited[ni] && grid[ni] >= minPixels) {
            visited[ni] = 1;
            queue.push(ni);
          }
        }
      }

      const regionWidth = (maxC - minC + 1) * cellSize;
      const regionHeight = (maxR - minR + 1) * cellSize;
      regions.push({
        x: minC * cellSize,
        y: minR * cellSize,
        width: regionWidth,
        height: regionHeight,
        diffPixelCount: totalDiff,
        regionType: classifyRegion(regionWidth, regionHeight, width),
      });
    }
  }

  return regions;
}

/**
 * Classify a diff region based on its shape relative to the image width.
 * - "edge": thin lines (height <= 2 or width <= 2)
 * - "shift": wide horizontal bands (width/height > 3 and width > 80% image width)
 * - "content": localized changes
 */
function classifyRegion(regionWidth: number, regionHeight: number, imageWidth: number): DiffRegionType {
  if (regionHeight <= 2 || regionWidth <= 2) return "edge";
  if (regionWidth / regionHeight > 3 && regionWidth > imageWidth * 0.8) return "shift";
  return "content";
}

/**
 * Compute luminance profile (average brightness per row).
 */
function luminanceProfile(data: Uint8Array, width: number, height: number): Float64Array {
  const profile = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
    profile[y] = sum / width;
  }
  return profile;
}

/**
 * Detect global vertical shift between two images using cross-correlation.
 * Returns the offset in pixels (positive = img2 shifted down).
 */
function detectGlobalShift(
  baseline: { data: Uint8Array; width: number; height: number },
  current: { data: Uint8Array; width: number; height: number },
  maxShift?: number,
): number {
  const height = Math.min(baseline.height, current.height);
  const width = Math.min(baseline.width, current.width);
  const limit = maxShift ?? Math.min(Math.floor(height / 4), 500);

  const profile1 = luminanceProfile(baseline.data, width, height);
  const profile2 = luminanceProfile(current.data, width, height);

  let bestOffset = 0;
  let bestCorr = -Infinity;

  for (let offset = -limit; offset <= limit; offset++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < height; y++) {
      const y2 = y + offset;
      if (y2 >= 0 && y2 < height) {
        sum += profile1[y] * profile2[y2];
        count++;
      }
    }
    const corr = count > 0 ? sum / count : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

/**
 * Count diff pixels after compensating for vertical shift.
 */
function compensatedDiffCount(
  baselineData: Uint8Array,
  currentData: Uint8Array,
  width: number,
  height: number,
  shift: number,
  threshold: number,
): number {
  let count = 0;
  for (let y = 0; y < height; y++) {
    const y2 = y + shift;
    if (y2 < 0 || y2 >= height) {
      count += width;
      continue;
    }
    for (let x = 0; x < width; x++) {
      const idx1 = (y * width + x) * 4;
      const idx2 = (y2 * width + x) * 4;
      const dr = Math.abs(baselineData[idx1] - currentData[idx2]);
      const dg = Math.abs(baselineData[idx1 + 1] - currentData[idx2 + 1]);
      const db = Math.abs(baselineData[idx1 + 2] - currentData[idx2 + 2]);
      if ((dr + dg + db) / 3 > threshold * 255) count++;
    }
  }
  return count;
}

/**
 * Generate a compact 10x10 ASCII heatmap of diff distribution.
 */
function generateCompact(
  diffData: Uint8Array,
  width: number,
  height: number,
  diffPixels: number,
  totalPixels: number,
  regions: DiffRegion[],
): string {
  const gridSize = 10;
  const cellW = Math.ceil(width / gridSize);
  const cellH = Math.ceil(height / gridSize);
  const grid: number[][] = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // pixelmatch diff output: changed pixels are red (R=255,G=0,B=0),
      // unchanged pixels are white (R=255,G=255,B=255). Check G channel.
      if (diffData[idx + 1] < 128) {
        const gx = Math.min(Math.floor(x / cellW), gridSize - 1);
        const gy = Math.min(Math.floor(y / cellH), gridSize - 1);
        grid[gy][gx]++;
      }
    }
  }

  const matchPct = ((1 - diffPixels / totalPixels) * 100).toFixed(0);
  const lines = [`diff:${diffPixels}/${totalPixels}(${matchPct}%match)`];
  const cellTotal = cellW * cellH;
  for (let gy = 0; gy < gridSize; gy++) {
    lines.push(grid[gy].map((v) => (v > cellTotal * 0.05 ? "X" : ".")).join(""));
  }
  if (regions.length > 0) {
    const regionStrs = regions.map((r) => `${r.regionType || "content"}:${r.x},${r.y},${r.width}x${r.height}`);
    lines.push(`regions:${regionStrs.join(";")}`);
  }
  return lines.join("\n");
}

/**
 * Generate a comprehensive diff report including clustering, shift detection,
 * and region classification. Compatible with mizchi/pixelmatch 0.5.0 DiffReport format.
 */
export async function generateDiffReport(
  snapshot: VrtSnapshot,
  opts: {
    threshold?: number;
    outputDir?: string;
    skipHeatmap?: boolean;
    detectShift?: boolean;
  } = {},
): Promise<DiffReport | null> {
  if (!snapshot.baselinePath) return null;

  const r = await runPixelDiff(snapshot.baselinePath, snapshot.screenshotPath, snapshot.testId, opts);
  const regions = detectDiffRegions(r.diffOutput, r.width, r.height);

  // Shift detection
  let globalShift = 0;
  let shiftRegions: ShiftRegion[] = [];
  let compensated = r.diffPixels;

  if (opts.detectShift !== false && r.height > 4) {
    globalShift = detectGlobalShift(r.resizedBaseline, r.resizedCurrent);
    if (globalShift !== 0) {
      compensated = compensatedDiffCount(
        r.resizedBaseline.data, r.resizedCurrent.data,
        r.width, r.height, globalShift, r.threshold,
      );
      shiftRegions = [{ yStart: 0, yEnd: r.height, shift: globalShift }];
    }
  }

  const shiftOnly = regions.length > 0 && regions.every((rg) => rg.regionType === "shift" || rg.regionType === "edge");
  const contentChangeCount = regions.filter((rg) => rg.regionType === "content").length;
  const compact = generateCompact(r.diffOutput, r.width, r.height, r.diffPixels, r.totalPixels, regions);

  return {
    diffPixels: r.diffPixels,
    totalPixels: r.totalPixels,
    diffRatio: r.diffPixels / r.totalPixels,
    regions,
    shiftOnly,
    contentChangeCount,
    globalShift,
    shiftRegions,
    compensatedDiffCount: compensated,
    compact,
  };
}

/**
 * Whiteout detection: checks if most of the image is white (or a single color).
 */
export function detectWhiteout(
  data: PngData,
  opts: { threshold?: number } = {}
): { isWhiteout: boolean; whiteRatio: number } {
  const threshold = opts.threshold ?? 0.95;
  const { width, height, data: pixels } = data;
  const total = width * height;
  let whiteCount = 0;

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    // Treat (250+, 250+, 250+) as white
    if (r >= 250 && g >= 250 && b >= 250) {
      whiteCount++;
    }
  }

  const whiteRatio = whiteCount / total;
  return { isWhiteout: whiteRatio >= threshold, whiteRatio };
}

/**
 * Empty content detection: checks if the image has low entropy.
 */
export function detectEmptyContent(
  data: PngData,
  opts: { threshold?: number } = {}
): { isEmpty: boolean; uniqueColors: number } {
  const threshold = opts.threshold ?? 8;
  const colorSet = new Set<number>();
  const { width, height, data: pixels } = data;
  const total = width * height;

  // Sampling with stride (full scan is too expensive)
  const stride = Math.max(1, Math.floor(total / 10000));
  for (let i = 0; i < total; i += stride) {
    const offset = i * 4;
    const color =
      (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2];
    colorSet.add(color);
  }

  return {
    isEmpty: colorSet.size <= threshold,
    uniqueColors: colorSet.size,
  };
}
