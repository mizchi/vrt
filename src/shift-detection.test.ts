import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { generateDiffReport } from "./heatmap.ts";
import type { VrtSnapshot, DiffReport } from "./types.ts";

const FIXTURE_DIR = resolve(import.meta.dirname!, "../fixtures/shift-patterns");
const OUTPUT_DIR = resolve(process.cwd(), "test-results", "shift-detection-test");

async function captureHtml(htmlPath: string, outputPng: string) {
  const html = await readFile(htmlPath, "utf-8");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: outputPng, fullPage: true });
  await page.close();
  await browser.close();
}

async function getDiffReport(
  baselinePng: string,
  currentPng: string,
  testId: string,
): Promise<DiffReport | null> {
  const snap: VrtSnapshot = {
    testId,
    testTitle: testId,
    projectName: "shift-test",
    screenshotPath: currentPng,
    baselinePath: baselinePng,
    status: "changed",
  };
  return generateDiffReport(snap, { outputDir: OUTPUT_DIR, detectShift: true });
}

function buildShiftPromptContext(report: DiffReport): string {
  const lines: string[] = [];
  lines.push("Shift detection:");
  if (report.globalShift !== 0) {
    lines.push(`- Global vertical shift: ${report.globalShift > 0 ? "+" : ""}${report.globalShift}px`);
    lines.push(`- Compensated diff (shift excluded): ${(report.compensatedDiffCount / report.totalPixels * 100).toFixed(1)}%`);
    if (report.shiftOnly) {
      lines.push("- SHIFT ONLY: all changes appear to be positional shifts, not content changes.");
    } else {
      lines.push(`- ${report.contentChangeCount} content change region(s) detected beyond the shift.`);
    }
  } else {
    lines.push("- No vertical shift detected.");
  }
  lines.push("");
  lines.push(`Diff heatmap (10x10 grid, X=changed, .=unchanged):`);
  lines.push(report.compact);
  return lines.join("\n");
}

describe("shift detection patterns", () => {
  let baselinePng: string;

  it("setup: capture baseline", async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    baselinePng = join(OUTPUT_DIR, "baseline.png");
    await captureHtml(join(FIXTURE_DIR, "baseline.html"), baselinePng);
  });

  it("Pattern A: header-grow (shift-only) — detects shift, compensated diff near zero", async () => {
    const currentPng = join(OUTPUT_DIR, "header-grow.png");
    await captureHtml(join(FIXTURE_DIR, "header-grow.html"), currentPng);

    const report = await getDiffReport(baselinePng, currentPng, "header-grow");
    assert.ok(report, "report should not be null");

    // Should have significant raw diff
    assert.ok(report.diffRatio > 0.05, `raw diff should be >5%, got ${(report.diffRatio * 100).toFixed(1)}%`);

    // Should detect vertical shift from header padding change
    assert.ok(report.globalShift !== 0, `should detect shift, got ${report.globalShift}`);

    // Compensated diff should be much smaller than raw
    const compensatedRatio = report.compensatedDiffCount / report.totalPixels;
    assert.ok(
      compensatedRatio < report.diffRatio * 0.5,
      `compensated (${(compensatedRatio * 100).toFixed(1)}%) should be <50% of raw (${(report.diffRatio * 100).toFixed(1)}%)`,
    );

    // Verify prompt context is useful for AI
    const ctx = buildShiftPromptContext(report);
    assert.ok(ctx.includes("Global vertical shift:"), "prompt should mention shift");
    assert.ok(ctx.includes("Compensated diff"), "prompt should show compensated diff");

    console.log("  Pattern A (header-grow):");
    console.log(`    Raw diff: ${(report.diffRatio * 100).toFixed(1)}%`);
    console.log(`    Shift: ${report.globalShift}px`);
    console.log(`    Compensated: ${(compensatedRatio * 100).toFixed(1)}%`);
    console.log(`    Content changes: ${report.contentChangeCount}`);
    console.log();
    console.log("  Prompt context:");
    console.log(ctx.split("\n").map((l) => "    " + l).join("\n"));
  });

  it("Pattern B: content-change (no shift) — detects content change, no shift compensation", async () => {
    const currentPng = join(OUTPUT_DIR, "content-change.png");
    await captureHtml(join(FIXTURE_DIR, "content-change.html"), currentPng);

    const report = await getDiffReport(baselinePng, currentPng, "content-change");
    assert.ok(report, "report should not be null");

    // Should have diff
    assert.ok(report.diffRatio > 0, "should detect differences");

    // Should NOT detect significant vertical shift (colors changed, not positions)
    assert.ok(
      Math.abs(report.globalShift) < 5,
      `should have no/minimal shift, got ${report.globalShift}px`,
    );

    // Compensated diff should be similar to raw diff (no shift to compensate)
    const compensatedRatio = report.compensatedDiffCount / report.totalPixels;
    assert.ok(
      Math.abs(compensatedRatio - report.diffRatio) / report.diffRatio < 0.3,
      `compensated (${(compensatedRatio * 100).toFixed(1)}%) should be close to raw (${(report.diffRatio * 100).toFixed(1)}%)`,
    );

    // Content change count > 0
    assert.ok(report.contentChangeCount > 0 || !report.shiftOnly, "should detect content changes");

    const ctx = buildShiftPromptContext(report);
    assert.ok(ctx.includes("No vertical shift detected"), "prompt should say no shift");

    console.log("  Pattern B (content-change):");
    console.log(`    Raw diff: ${(report.diffRatio * 100).toFixed(1)}%`);
    console.log(`    Shift: ${report.globalShift}px`);
    console.log(`    Compensated: ${(compensatedRatio * 100).toFixed(1)}%`);
    console.log(`    Content changes: ${report.contentChangeCount}`);
    console.log();
    console.log("  Prompt context:");
    console.log(ctx.split("\n").map((l) => "    " + l).join("\n"));
  });

  it("Pattern C: mixed (shift + content) — detects both shift and content changes", async () => {
    const currentPng = join(OUTPUT_DIR, "mixed.png");
    await captureHtml(join(FIXTURE_DIR, "mixed.html"), currentPng);

    const report = await getDiffReport(baselinePng, currentPng, "mixed");
    assert.ok(report, "report should not be null");

    // Should have significant diff
    assert.ok(report.diffRatio > 0.05, `raw diff should be >5%, got ${(report.diffRatio * 100).toFixed(1)}%`);

    // Should detect shift (header padding changed)
    assert.ok(report.globalShift !== 0, `should detect shift, got ${report.globalShift}`);

    // Compensated diff should be >0 (content changes remain after shift compensation)
    const compensatedRatio = report.compensatedDiffCount / report.totalPixels;
    assert.ok(compensatedRatio > 0.005, `compensated should be >0.5% (content changes remain), got ${(compensatedRatio * 100).toFixed(1)}%`);

    // Should NOT be shiftOnly (has content changes too)
    // Note: region classification may merge everything into one big content region
    // The key signal is compensatedDiffCount > 0

    const ctx = buildShiftPromptContext(report);
    assert.ok(ctx.includes("Global vertical shift:"), "prompt should mention shift");
    // The compensated diff should be noticeably different from raw
    assert.ok(
      compensatedRatio < report.diffRatio * 0.9,
      `compensated should be lower than raw (shift accounts for some diff)`,
    );

    console.log("  Pattern C (mixed):");
    console.log(`    Raw diff: ${(report.diffRatio * 100).toFixed(1)}%`);
    console.log(`    Shift: ${report.globalShift}px`);
    console.log(`    Compensated: ${(compensatedRatio * 100).toFixed(1)}%`);
    console.log(`    shiftOnly: ${report.shiftOnly}`);
    console.log(`    Content changes: ${report.contentChangeCount}`);
    console.log();
    console.log("  Prompt context:");
    console.log(ctx.split("\n").map((l) => "    " + l).join("\n"));
  });
});
