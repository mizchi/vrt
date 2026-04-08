import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png-utils.ts";
import { runVerifyPipeline } from "./vrt-verify.ts";

const TMP = join(import.meta.dirname!, "..", "test-results", "vrt-verify-test");

function createPalettePng(
  width: number,
  height: number,
  colors: Array<[number, number, number]>,
): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  const cols = 3;
  const rows = Math.ceil(colors.length / cols);
  const cellWidth = Math.floor(width / cols);
  const cellHeight = Math.floor(height / rows);

  for (let i = 0; i < colors.length; i++) {
    const [r, g, b] = colors[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const startX = col * cellWidth;
    const startY = row * cellHeight;
    const endX = col === cols - 1 ? width : startX + cellWidth;
    const endY = row === rows - 1 ? height : startY + cellHeight;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = r;
        data[offset + 1] = g;
        data[offset + 2] = b;
        data[offset + 3] = 255;
      }
    }
  }

  return { width, height, data };
}

describe("runVerifyPipeline", () => {
  it("compares existing PNG snapshots without Playwright capture", async () => {
    const baselinesDir = join(TMP, "baselines");
    const snapshotsDir = join(TMP, "snapshots");
    const outputDir = join(TMP, "output");
    const reportPath = join(TMP, "vrt-report.json");
    const expectationPath = join(TMP, "expectation.json");

    await rm(TMP, { recursive: true, force: true });
    await mkdir(baselinesDir, { recursive: true });
    await mkdir(snapshotsDir, { recursive: true });

    const baselineColors: Array<[number, number, number]> = [
      [40, 80, 140],
      [60, 120, 160],
      [80, 160, 120],
      [120, 160, 80],
      [140, 120, 60],
      [100, 100, 160],
      [60, 140, 120],
      [120, 120, 120],
      [80, 80, 80],
    ];
    const currentColors = [...baselineColors];
    currentColors[4] = [90, 150, 210];

    try {
      await encodePng(join(baselinesDir, "home.png"), createPalettePng(120, 120, baselineColors));
      await encodePng(join(snapshotsDir, "home.png"), createPalettePng(120, 120, currentColors));

      const result = await runVerifyPipeline({
        projectRoot: TMP,
        baselinesDir,
        snapshotsDir,
        outputDir,
        reportPath,
        expectationPath,
      });

      assert.equal(result.vrtDiffs.length, 1);
      assert.equal(result.a11yDiffs.length, 0);
      assert.equal(result.passed, true);
      assert.equal(result.needsReview, true);
      assert.ok(existsSync(reportPath), "verify should emit a report");

      const report = JSON.parse(await readFile(reportPath, "utf-8")) as {
        vrtDiffs: Array<{ snapshot: { testId: string } }>;
      };
      assert.equal(report.vrtDiffs.length, 1);
      assert.equal(report.vrtDiffs[0]?.snapshot.testId, "home");
    } finally {
      await rm(TMP, { recursive: true, force: true });
    }
  });
});
