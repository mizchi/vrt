import { readFile, writeFile } from "node:fs/promises";
import type { VrtDiff, VrtSnapshot, DiffRegion } from "./types.ts";

// PNG decoding/encoding and pixel comparison
// Uses pngjs + pixelmatch — both are devDependencies

interface PngData {
  width: number;
  height: number;
  data: Uint8Array;
}

function cropImage(img: PngData, w: number, h: number): PngData {
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
 * PNG ファイルを読み込み、RGBA ピクセルデータを返す
 * pngjs がない環境では raw バイトを返す (テスト用)
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
 * RGBA ピクセルデータを PNG ファイルに書き出す
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

/**
 * 2つのスクリーンショットをピクセル比較し、差分ヒートマップを生成する
 */
export async function compareScreenshots(
  snapshot: VrtSnapshot,
  opts: {
    threshold?: number; // pixelmatch threshold (0-1), default 0.1
    outputDir?: string;
    skipHeatmap?: boolean; // skip PNG heatmap generation for speed
  } = {}
): Promise<VrtDiff | null> {
  if (!snapshot.baselinePath) return null;

  const pixelmatch = (await import("pixelmatch")).default;
  const baseline = await decodePng(snapshot.baselinePath);
  const current = await decodePng(snapshot.screenshotPath);

  // サイズが異なる場合: 共通領域で比較 + 余剰領域を追加 diff として計上
  let resizedBaseline = baseline;
  let resizedCurrent = current;
  let overflowPixels = 0;

  if (baseline.width !== current.width || baseline.height !== current.height) {
    const commonW = Math.min(baseline.width, current.width);
    const commonH = Math.min(baseline.height, current.height);
    const maxW = Math.max(baseline.width, current.width);
    const maxH = Math.max(baseline.height, current.height);
    overflowPixels = maxW * maxH - commonW * commonH;

    // Crop both images to common region
    resizedBaseline = cropImage(baseline, commonW, commonH);
    resizedCurrent = cropImage(current, commonW, commonH);
  }

  const width = resizedBaseline.width;
  const height = resizedBaseline.height;
  const totalPixels = width * height + overflowPixels;
  const diffOutput = new Uint8Array(width * height * 4);
  const threshold = opts.threshold ?? 0.1;

  const diffPixels = overflowPixels + pixelmatch(
    resizedBaseline.data,
    resizedCurrent.data,
    diffOutput,
    width,
    height,
    { threshold }
  );

  // ヒートマップ出力 (skip PNG encode if skipHeatmap is set)
  let heatmapPath: string | undefined;
  if (opts.outputDir && diffPixels > 0 && !opts.skipHeatmap) {
    const safeName = snapshot.testId.replace(/[/\\:]/g, "_");
    heatmapPath = `${opts.outputDir}/${safeName}_heatmap.png`;
    await encodePng(heatmapPath, { width, height, data: diffOutput });
  }

  // 差分領域を検出 (連結成分解析の簡易版: グリッドベース)
  const regions = detectDiffRegions(diffOutput, width, height);

  return {
    snapshot,
    diffPixels,
    totalPixels,
    diffRatio: diffPixels / totalPixels,
    heatmapPath,
    regions,
  };
}

/**
 * グリッドベースの差分領域検出
 * 画像をセルに分割し、差分ピクセルが閾値を超えるセルをクラスタリング
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

  // 各セルの差分ピクセル数をカウント
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // pixelmatch の diff 出力で赤チャネルが非ゼロ = 差分
      if (diffData[idx] > 0) {
        const col = Math.floor(x / cellSize);
        const row = Math.floor(y / cellSize);
        grid[row * cols + col]++;
      }
    }
  }

  // 隣接する差分セルをマージして矩形領域にする
  const visited = new Uint8Array(cols * rows);
  const regions: DiffRegion[] = [];
  const minPixels = 4; // ノイズ除去: 最低差分ピクセル数

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (visited[i] || grid[i] < minPixels) continue;

      // BFS でクラスタを検出
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

      regions.push({
        x: minC * cellSize,
        y: minR * cellSize,
        width: (maxC - minC + 1) * cellSize,
        height: (maxR - minR + 1) * cellSize,
        diffPixelCount: totalDiff,
      });
    }
  }

  return regions;
}

/**
 * 白飛び検出: 画像の大部分が白 (または単一色) かどうかを判定
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
    // 白 (250+, 250+, 250+) とみなす
    if (r >= 250 && g >= 250 && b >= 250) {
      whiteCount++;
    }
  }

  const whiteRatio = whiteCount / total;
  return { isWhiteout: whiteRatio >= threshold, whiteRatio };
}

/**
 * 空コンテンツ検出: 画像のエントロピーが低いかを判定
 */
export function detectEmptyContent(
  data: PngData,
  opts: { threshold?: number } = {}
): { isEmpty: boolean; uniqueColors: number } {
  const threshold = opts.threshold ?? 8;
  const colorSet = new Set<number>();
  const { width, height, data: pixels } = data;
  const total = width * height;

  // サンプリング (全ピクセルは重いのでストライド)
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
