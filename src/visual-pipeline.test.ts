/**
 * Visual pipeline 統合テスト
 *
 * 実際の PNG 画像を生成し、pixelmatch → heatmap → visual-semantic の
 * パイプライン全体を通すテスト。
 *
 * Playwright 不要: Canvas API の代わりに pngjs で直接 PNG を生成する。
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { compareScreenshots, detectWhiteout } from "./heatmap.ts";
import { decodePng } from "./png-utils.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import type { VrtSnapshot } from "./types.ts";

const TMP = join(import.meta.dirname!, "..", "test-results", "visual-test");

// PNG 生成ヘルパ: 単色矩形を描く
function createTestPng(width: number, height: number, regions: Array<{
  x: number; y: number; w: number; h: number; r: number; g: number; b: number;
}>, bgColor = { r: 255, g: 255, b: 255 }): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  // 背景色
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bgColor.r;
    data[i * 4 + 1] = bgColor.g;
    data[i * 4 + 2] = bgColor.b;
    data[i * 4 + 3] = 255;
  }
  // 矩形を描画
  for (const reg of regions) {
    for (let y = reg.y; y < Math.min(reg.y + reg.h, height); y++) {
      for (let x = reg.x; x < Math.min(reg.x + reg.w, width); x++) {
        const i = (y * width + x) * 4;
        data[i] = reg.r;
        data[i + 1] = reg.g;
        data[i + 2] = reg.b;
        data[i + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

async function savePng(path: string, png: { width: number; height: number; data: Uint8Array }) {
  const { encodePng } = await import("./png-utils.ts");
  await encodePng(path, png);
}

before(async () => {
  await mkdir(TMP, { recursive: true });
});

after(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("Visual pipeline: real PNG diff", () => {
  it("should detect color change in a button region", async () => {
    // Baseline: 白背景 + 青いボタン領域
    const baseline = createTestPng(200, 100, [
      { x: 50, y: 30, w: 100, h: 40, r: 0, g: 100, b: 255 },
    ]);
    // Current: 白背景 + 緑のボタン領域 (色変更)
    const current = createTestPng(200, 100, [
      { x: 50, y: 30, w: 100, h: 40, r: 0, g: 200, b: 50 },
    ]);

    const baselinePath = join(TMP, "button-blue.png");
    const currentPath = join(TMP, "button-green.png");
    await savePng(baselinePath, baseline);
    await savePng(currentPath, current);

    const snapshot: VrtSnapshot = {
      testId: "button-color",
      testTitle: "button-color",
      projectName: "test",
      screenshotPath: currentPath,
      baselinePath,
      status: "changed",
    };

    const diff = await compareScreenshots(snapshot, { outputDir: TMP });
    assert.ok(diff, "Should produce diff");
    assert.ok(diff!.diffPixels > 0, `Diff pixels: ${diff!.diffPixels}`);
    assert.ok(diff!.diffRatio > 0.1, `Diff ratio: ${diff!.diffRatio}`);
    assert.ok(diff!.regions.length > 0, "Should have diff regions");

    // Visual semantic classification
    const semantic = classifyVisualDiff(diff!);
    assert.ok(semantic.changes.length > 0, "Should classify changes");
    assert.ok(semantic.summary.length > 0, `Summary: ${semantic.summary}`);
  });

  it("should detect layout shift (element moved)", async () => {
    // Baseline: ボタンが左にある
    const baseline = createTestPng(300, 100, [
      { x: 10, y: 30, w: 80, h: 40, r: 50, g: 50, b: 200 },
    ]);
    // Current: ボタンが右に移動
    const current = createTestPng(300, 100, [
      { x: 210, y: 30, w: 80, h: 40, r: 50, g: 50, b: 200 },
    ]);

    const baselinePath = join(TMP, "layout-before.png");
    const currentPath = join(TMP, "layout-after.png");
    await savePng(baselinePath, baseline);
    await savePng(currentPath, current);

    const snapshot: VrtSnapshot = {
      testId: "layout-shift",
      testTitle: "layout-shift",
      projectName: "test",
      screenshotPath: currentPath,
      baselinePath,
      status: "changed",
    };

    const diff = await compareScreenshots(snapshot, { outputDir: TMP });
    assert.ok(diff, "Should produce diff");
    // 2つの領域: 元の位置 (要素消失) + 新しい位置 (要素出現)
    assert.ok(diff!.regions.length >= 1, `Regions: ${diff!.regions.length}`);
  });

  it("should detect no diff for identical images", async () => {
    const img = createTestPng(100, 100, [
      { x: 10, y: 10, w: 80, h: 80, r: 100, g: 150, b: 200 },
    ]);

    const path1 = join(TMP, "identical-a.png");
    const path2 = join(TMP, "identical-b.png");
    await savePng(path1, img);
    await savePng(path2, img);

    const snapshot: VrtSnapshot = {
      testId: "identical",
      testTitle: "identical",
      projectName: "test",
      screenshotPath: path2,
      baselinePath: path1,
      status: "changed",
    };

    const diff = await compareScreenshots(snapshot);
    assert.ok(diff !== null);
    assert.equal(diff!.diffPixels, 0, "Should have 0 diff pixels");
  });

  it("should detect whiteout from real PNG", async () => {
    const whitePng = createTestPng(100, 100, []); // all white
    const path = join(TMP, "whiteout.png");
    await savePng(path, whitePng);

    const decoded = await decodePng(path);
    const result = detectWhiteout(decoded);
    assert.ok(result.isWhiteout, `Should detect whiteout: ratio=${result.whiteRatio}`);
  });

  it("should not flag colorful image as whiteout", async () => {
    const colorful = createTestPng(100, 100, [
      { x: 0, y: 0, w: 50, h: 50, r: 200, g: 0, b: 0 },
      { x: 50, y: 0, w: 50, h: 50, r: 0, g: 200, b: 0 },
      { x: 0, y: 50, w: 50, h: 50, r: 0, g: 0, b: 200 },
      { x: 50, y: 50, w: 50, h: 50, r: 200, g: 200, b: 0 },
    ]);
    const path = join(TMP, "colorful.png");
    await savePng(path, colorful);

    const decoded = await decodePng(path);
    const result = detectWhiteout(decoded);
    assert.ok(!result.isWhiteout, `Should not flag colorful: ratio=${result.whiteRatio}`);
  });

  it("should detect text-like region change", async () => {
    // Baseline: 横長のテキスト領域
    const baseline = createTestPng(400, 100, [
      { x: 20, y: 40, w: 360, h: 16, r: 0, g: 0, b: 0 },
    ]);
    // Current: テキストが変わった (微妙に異なるピクセル)
    const current = createTestPng(400, 100, [
      { x: 20, y: 40, w: 300, h: 16, r: 0, g: 0, b: 0 },
    ]);

    const baselinePath = join(TMP, "text-before.png");
    const currentPath = join(TMP, "text-after.png");
    await savePng(baselinePath, baseline);
    await savePng(currentPath, current);

    const snapshot: VrtSnapshot = {
      testId: "text-change",
      testTitle: "text-change",
      projectName: "test",
      screenshotPath: currentPath,
      baselinePath,
      status: "changed",
    };

    const diff = await compareScreenshots(snapshot, { outputDir: TMP });
    assert.ok(diff, "Should produce diff");

    const semantic = classifyVisualDiff(diff!);
    assert.ok(semantic.changes.length > 0);
    // テキスト領域の変化は text-change or element-removed として分類されるはず
    assert.ok(semantic.summary.length > 0, `Summary: ${semantic.summary}`);
  });

  it("should generate heatmap file", async () => {
    const baseline = createTestPng(100, 100, [
      { x: 10, y: 10, w: 30, h: 30, r: 255, g: 0, b: 0 },
    ]);
    const current = createTestPng(100, 100, [
      { x: 10, y: 10, w: 30, h: 30, r: 0, g: 0, b: 255 },
    ]);

    const baselinePath = join(TMP, "heatmap-base.png");
    const currentPath = join(TMP, "heatmap-curr.png");
    await savePng(baselinePath, baseline);
    await savePng(currentPath, current);

    const snapshot: VrtSnapshot = {
      testId: "heatmap-gen",
      testTitle: "heatmap-gen",
      projectName: "test",
      screenshotPath: currentPath,
      baselinePath,
      status: "changed",
    };

    const diff = await compareScreenshots(snapshot, { outputDir: TMP });
    assert.ok(diff?.heatmapPath, "Should generate heatmap file");

    // Verify the heatmap is a valid PNG
    const heatmapPng = await decodePng(diff!.heatmapPath!);
    assert.equal(heatmapPng.width, 100);
    assert.equal(heatmapPng.height, 100);
  });
});
