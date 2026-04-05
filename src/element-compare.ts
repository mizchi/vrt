#!/usr/bin/env node
/**
 * Element-level VRT comparison
 *
 * Instead of full-page pixel diff (which cascades when a header shifts),
 * compares individual DOM elements independently via locator.screenshot().
 *
 * Usage:
 *   vrt elements --url http://localhost:3000/ --current-url http://localhost:8080/ \
 *     --selectors "header,main,footer"
 *   vrt elements before.html after.html --selectors "header,.content,.sidebar"
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { compareScreenshots, encodePng, decodePng } from "./heatmap.ts";
import { applyMask, parseMaskSelectors } from "./mask.ts";
import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD, hr } from "./terminal-colors.ts";
import type { VrtSnapshot } from "./types.ts";

// ---- Types ----

export interface ElementCompareOptions {
  /** CSS selectors for elements to compare */
  selectors: string[];
  /** Baseline HTML file path */
  baselineFile?: string;
  /** Current HTML file path */
  currentFile?: string;
  /** Baseline URL */
  baselineUrl?: string;
  /** Current URL */
  currentUrl?: string;
  /** Viewport width/height */
  viewport?: { width: number; height: number };
  /** Output directory */
  outputDir: string;
  /** Selectors to mask before screenshot */
  maskSelectors?: string[];
  /** pixelmatch threshold */
  threshold?: number;
}

export interface ElementDiffResult {
  selector: string;
  found: { baseline: boolean; current: boolean };
  /** Bounding box of the element in baseline */
  baselineBBox?: { x: number; y: number; width: number; height: number };
  /** Bounding box of the element in current */
  currentBBox?: { x: number; y: number; width: number; height: number };
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  heatmapPath?: string;
  baselinePath?: string;
  currentPath?: string;
}

export interface ElementCompareReport {
  baselineSource: string;
  currentSource: string;
  viewport: { width: number; height: number };
  elements: ElementDiffResult[];
  summary: {
    total: number;
    matched: number;
    changed: number;
    missing: number;
    /** Full-page diff ratio (for comparison) */
    fullPageDiffRatio?: number;
    /** Sum of element-level diff pixels (isolates actual changes from cascading shifts) */
    elementDiffRatio: number;
  };
}

// ---- Core ----

async function captureElementScreenshot(
  page: Page,
  selector: string,
  outputPath: string,
): Promise<{ found: boolean; bbox?: { x: number; y: number; width: number; height: number } }> {
  const locator = page.locator(selector).first();
  try {
    await locator.waitFor({ state: "visible", timeout: 3000 });
    const bbox = await locator.boundingBox();
    if (!bbox) return { found: false };
    await locator.screenshot({ path: outputPath });
    return { found: true, bbox: { x: Math.round(bbox.x), y: Math.round(bbox.y), width: Math.round(bbox.width), height: Math.round(bbox.height) } };
  } catch {
    return { found: false };
  }
}

export async function runElementCompare(
  options: ElementCompareOptions,
): Promise<ElementCompareReport> {
  const {
    selectors,
    viewport = { width: 1280, height: 900 },
    outputDir,
    maskSelectors = [],
    threshold = 0.1,
  } = options;

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const results: ElementDiffResult[] = [];
  let fullPageDiffRatio: number | undefined;

  try {
    // Setup baseline page
    const baselinePage = await browser.newPage({ viewport });
    if (options.baselineUrl) {
      await baselinePage.goto(options.baselineUrl, { waitUntil: "networkidle", timeout: 30000 });
    } else if (options.baselineFile) {
      const html = await readFile(resolve(options.baselineFile), "utf-8");
      await baselinePage.setContent(html, { waitUntil: "networkidle" });
    }
    await applyMask(baselinePage, maskSelectors);

    // Setup current page
    const currentPage = await browser.newPage({ viewport });
    if (options.currentUrl) {
      await currentPage.goto(options.currentUrl, { waitUntil: "networkidle", timeout: 30000 });
    } else if (options.currentFile) {
      const html = await readFile(resolve(options.currentFile), "utf-8");
      await currentPage.setContent(html, { waitUntil: "networkidle" });
    }
    await applyMask(currentPage, maskSelectors);

    // Full-page comparison for reference
    const fullBaselinePath = join(outputDir, "fullpage-baseline.png");
    const fullCurrentPath = join(outputDir, "fullpage-current.png");
    await baselinePage.screenshot({ path: fullBaselinePath, fullPage: true });
    await currentPage.screenshot({ path: fullCurrentPath, fullPage: true });

    const fullSnap: VrtSnapshot = {
      testId: "fullpage",
      testTitle: "Full Page",
      projectName: "element-compare",
      screenshotPath: fullCurrentPath,
      baselinePath: fullBaselinePath,
      status: "changed",
    };
    const fullDiff = await compareScreenshots(fullSnap, { outputDir, threshold });
    fullPageDiffRatio = fullDiff?.diffRatio ?? 0;

    // Element-level comparison
    for (const selector of selectors) {
      const safeSelector = selector.replace(/[^a-zA-Z0-9_-]/g, "_");
      const baselinePath = join(outputDir, `el-${safeSelector}-baseline.png`);
      const currentPath = join(outputDir, `el-${safeSelector}-current.png`);

      const baselineResult = await captureElementScreenshot(baselinePage, selector, baselinePath);
      const currentResult = await captureElementScreenshot(currentPage, selector, currentPath);

      if (!baselineResult.found || !currentResult.found) {
        results.push({
          selector,
          found: { baseline: baselineResult.found, current: currentResult.found },
          diffPixels: 0,
          totalPixels: 0,
          diffRatio: baselineResult.found !== currentResult.found ? 1 : 0,
        });
        continue;
      }

      const snap: VrtSnapshot = {
        testId: `el-${safeSelector}`,
        testTitle: `Element: ${selector}`,
        projectName: "element-compare",
        screenshotPath: currentPath,
        baselinePath: baselinePath,
        status: "changed",
      };
      const diff = await compareScreenshots(snap, { outputDir, threshold });

      results.push({
        selector,
        found: { baseline: true, current: true },
        baselineBBox: baselineResult.bbox,
        currentBBox: currentResult.bbox,
        diffPixels: diff?.diffPixels ?? 0,
        totalPixels: diff?.totalPixels ?? 0,
        diffRatio: diff?.diffRatio ?? 0,
        heatmapPath: diff?.heatmapPath,
        baselinePath,
        currentPath,
      });
    }

    await baselinePage.close();
    await currentPage.close();
  } finally {
    await browser.close();
  }

  // Build summary
  const matched = results.filter((r) => r.found.baseline && r.found.current);
  const changed = matched.filter((r) => r.diffRatio > 0);
  const missing = results.filter((r) => !r.found.baseline || !r.found.current);
  const totalElementPixels = matched.reduce((s, r) => s + r.totalPixels, 0);
  const totalElementDiffPixels = matched.reduce((s, r) => s + r.diffPixels, 0);

  const report: ElementCompareReport = {
    baselineSource: options.baselineUrl ?? options.baselineFile ?? "",
    currentSource: options.currentUrl ?? options.currentFile ?? "",
    viewport,
    elements: results,
    summary: {
      total: selectors.length,
      matched: matched.length,
      changed: changed.length,
      missing: missing.length,
      fullPageDiffRatio,
      elementDiffRatio: totalElementPixels > 0 ? totalElementDiffPixels / totalElementPixels : 0,
    },
  };

  return report;
}

// ---- CLI ----

function parseArgs(args: string[]): ElementCompareOptions {
  function getArg(name: string, fallback = ""): string {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
  }

  const selectorsRaw = getArg("selectors");
  if (!selectorsRaw) {
    console.error("Error: --selectors is required (comma-separated CSS selectors)");
    process.exit(1);
  }
  const selectors = selectorsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const baselineUrl = getArg("url") || undefined;
  const currentUrl = getArg("current-url") || undefined;

  // Positional args for file mode
  const positional = args.filter((a) => !a.startsWith("--") && !args.some((b, i) => b.startsWith("--") && args[i + 1] === a));
  const baselineFile = !baselineUrl ? positional[0] : undefined;
  const currentFile = !currentUrl ? positional[1] : undefined;

  const vpArg = getArg("viewport", "1280x900");
  const [w, h] = vpArg.split("x").map(Number);

  return {
    selectors,
    baselineFile,
    currentFile,
    baselineUrl,
    currentUrl,
    viewport: { width: w || 1280, height: h || 900 },
    outputDir: resolve(getArg("output", join(process.cwd(), "test-results", "element-compare"))),
    maskSelectors: parseMaskSelectors(args),
    threshold: parseFloat(getArg("threshold", "0.1")),
  };
}

async function main() {
  const cliArgs = process.argv.slice(2);
  const options = parseArgs(cliArgs);

  if (!options.baselineUrl && !options.baselineFile) {
    console.log(`Usage:`);
    console.log(`  vrt elements --url <baseline> --current-url <current> --selectors "header,main,footer"`);
    console.log(`  vrt elements before.html after.html --selectors "header,.content"`);
    console.log();
    console.log(`Options:`);
    console.log(`  --selectors <sel1,sel2,...>   CSS selectors to compare (required)`);
    console.log(`  --viewport <WxH>             Viewport size (default: 1280x900)`);
    console.log(`  --output <dir>               Output directory`);
    console.log(`  --mask <selectors>            Mask dynamic content`);
    console.log(`  --threshold <0-1>             pixelmatch threshold (default: 0.1)`);
    process.exit(1);
  }

  console.log();
  console.log(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  Element-level VRT Compare                                           ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${DIM}Selectors: ${options.selectors.join(", ")}${RESET}`);
  console.log(`  ${DIM}Viewport: ${options.viewport?.width}x${options.viewport?.height}${RESET}`);
  console.log();

  const report = await runElementCompare(options);

  // Print results
  for (const el of report.elements) {
    if (!el.found.baseline && !el.found.current) {
      console.log(`  ${DIM}${el.selector.padEnd(30)}${RESET} ${YELLOW}not found${RESET}`);
    } else if (!el.found.baseline || !el.found.current) {
      const side = el.found.baseline ? "current" : "baseline";
      console.log(`  ${DIM}${el.selector.padEnd(30)}${RESET} ${RED}missing in ${side}${RESET}`);
    } else if (el.diffRatio === 0) {
      console.log(`  ${el.selector.padEnd(30)} ${GREEN}0.0%${RESET}`);
    } else {
      const color = el.diffRatio < 0.01 ? YELLOW : RED;
      const pct = (el.diffRatio * 100).toFixed(2);
      const bbox = el.currentBBox;
      const bboxStr = bbox ? ` ${DIM}(${bbox.width}x${bbox.height} @${bbox.x},${bbox.y})${RESET}` : "";
      console.log(`  ${el.selector.padEnd(30)} ${color}${pct}%${RESET}${bboxStr}`);
    }
  }

  // Summary
  console.log();
  hr();
  console.log();

  const { summary } = report;
  if (summary.fullPageDiffRatio !== undefined) {
    const fpColor = summary.fullPageDiffRatio === 0 ? GREEN : summary.fullPageDiffRatio < 0.01 ? YELLOW : RED;
    console.log(`  Full-page diff:    ${fpColor}${(summary.fullPageDiffRatio * 100).toFixed(2)}%${RESET}`);
  }
  const elColor = summary.elementDiffRatio === 0 ? GREEN : summary.elementDiffRatio < 0.01 ? YELLOW : RED;
  console.log(`  Element diff:      ${elColor}${(summary.elementDiffRatio * 100).toFixed(2)}%${RESET}`);
  console.log(`  ${DIM}Elements: ${summary.total} total, ${summary.matched} matched, ${summary.changed} changed, ${summary.missing} missing${RESET}`);

  if (summary.fullPageDiffRatio !== undefined && summary.fullPageDiffRatio > 0 && summary.elementDiffRatio < summary.fullPageDiffRatio) {
    const reduction = ((1 - summary.elementDiffRatio / summary.fullPageDiffRatio) * 100).toFixed(0);
    console.log(`  ${GREEN}Element-level reduces noise by ${reduction}%${RESET}`);
  }

  console.log();

  // Write report
  const reportPath = join(options.outputDir, "element-compare-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`  ${DIM}Report: ${reportPath}${RESET}`);
  console.log();
}

if (process.argv[1]?.endsWith("element-compare.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
