import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { generateDiffReport } from "./heatmap.ts";
import type { VrtSnapshot } from "./types.ts";

const FIXTURE_DIR = resolve(import.meta.dirname!, "../fixtures/element-compare");
const OUTPUT_DIR = resolve(process.cwd(), "test-results", "heatmap-report-test");

import { chromium } from "playwright";

async function captureFixture(htmlFile: string, outputPath: string) {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(htmlFile, "utf-8");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: outputPath, fullPage: true });
  await page.close();
  await browser.close();
}

describe("generateDiffReport", () => {
  it("detects vertical shift and reduces noise via compensation", async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const baselinePng = join(OUTPUT_DIR, "shift-baseline.png");
    const currentPng = join(OUTPUT_DIR, "shift-current.png");

    await captureFixture(join(FIXTURE_DIR, "before.html"), baselinePng);
    await captureFixture(join(FIXTURE_DIR, "after.html"), currentPng);

    const snap: VrtSnapshot = {
      testId: "shift-test",
      testTitle: "Shift Test",
      projectName: "test",
      screenshotPath: currentPng,
      baselinePath: baselinePng,
      status: "changed",
    };

    const report = await generateDiffReport(snap, {
      outputDir: OUTPUT_DIR,
      detectShift: true,
    });

    assert.ok(report, "report should not be null");
    assert.ok(report.diffPixels > 0, "should detect differences");

    // Shift detection: header grew ~113px, content shifted down
    assert.ok(report.globalShift !== 0, `should detect vertical shift, got ${report.globalShift}`);
    assert.ok(
      Math.abs(report.globalShift) > 50,
      `shift should be significant (header change), got ${report.globalShift}px`,
    );

    // Compensated diff should be significantly less than raw diff
    const reduction = 1 - report.compensatedDiffCount / report.diffPixels;
    assert.ok(
      reduction > 0.2,
      `shift compensation should reduce diff by >20%, got ${(reduction * 100).toFixed(0)}%`,
    );

    // Compact report should be present
    assert.ok(report.compact.includes("diff:"), "compact should include diff header");
    assert.ok(report.compact.includes("match"), "compact should include match percentage");
  });

  it("reports no shift for identical images", async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });

    const baselinePng = join(OUTPUT_DIR, "noshift-baseline.png");
    await captureFixture(join(FIXTURE_DIR, "before.html"), baselinePng);

    const snap: VrtSnapshot = {
      testId: "noshift-test",
      testTitle: "No Shift Test",
      projectName: "test",
      screenshotPath: baselinePng,
      baselinePath: baselinePng,
      status: "changed",
    };

    const report = await generateDiffReport(snap, { detectShift: true });

    assert.ok(report, "report should not be null");
    assert.equal(report.diffPixels, 0, "identical images should have 0 diff");
    assert.equal(report.globalShift, 0, "no shift for identical images");
    assert.equal(report.compensatedDiffCount, 0);
  });
});
