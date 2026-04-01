#!/usr/bin/env node
/**
 * Migration VRT Compare
 *
 * 2つの HTML ファイルを複数 viewport でレンダリングし、pixel diff を取得する。
 * Reset CSS 切り替え、Tailwind → vanilla CSS 等の移行検証用。
 *
 * Usage:
 *   npx tsx src/migration-compare.ts before.html after.html
 *   npx tsx src/migration-compare.ts --dir fixtures/migration/reset-css --baseline normalize.html --variants modern-normalize.html destyle.html no-reset.html
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { chromium, type Browser } from "playwright";
import { compareScreenshots, encodePng } from "./heatmap.ts";
import { discoverViewports, type ViewportSpec } from "./viewport-discovery.ts";
import type { VrtSnapshot } from "./types.ts";

// ---- Config ----

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
function getArgList(name: string): string[] {
  const idx = args.indexOf(`--${name}`);
  if (idx < 0) return [];
  const values: string[] = [];
  for (let i = idx + 1; i < args.length && !args[i].startsWith("--"); i++) {
    values.push(args[i]);
  }
  return values;
}

const DIR = getArg("dir", ".");
const BASELINE = getArg("baseline", args[0] ?? "");
const VARIANTS = getArgList("variants").length > 0 ? getArgList("variants") : (args[1] ? [args[1]] : []);
const TMP = join(process.cwd(), "test-results", "migration");
const AUTO_DISCOVER = !hasFlag("no-discover");
const MAX_VIEWPORTS = parseInt(getArg("max-viewports", "15"), 10);
const RANDOM_SAMPLES = parseInt(getArg("random-samples", "1"), 10);
function hasFlag(name: string): boolean { return args.includes(`--${name}`); }

// Fallback viewports (used when --no-discover)
const STATIC_VIEWPORTS: ViewportSpec[] = [
  { width: 1440, height: 900, label: "wide", reason: "standard" },
  { width: 1280, height: 900, label: "desktop", reason: "standard" },
  { width: 375, height: 812, label: "mobile", reason: "standard" },
];

// ---- Terminal helpers ----

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function hr() { console.log(`${DIM}${"─".repeat(76)}${RESET}`); }

// ---- Main ----

async function main() {
  if (!BASELINE || VARIANTS.length === 0) {
    console.log(`Usage: npx tsx src/migration-compare.ts --dir <dir> --baseline <file> --variants <file1> <file2> ...`);
    console.log(`   or: npx tsx src/migration-compare.ts <before.html> <after.html>`);
    process.exit(1);
  }

  await mkdir(TMP, { recursive: true });

  const baselinePath = join(DIR, BASELINE);
  const baselineHtml = await readFile(baselinePath, "utf-8");
  const baselineName = basename(BASELINE, ".html");

  // Auto-discover breakpoints from all HTML files
  let VIEWPORTS: ViewportSpec[];
  if (AUTO_DISCOVER) {
    // Collect all HTML to find all breakpoints
    const allHtmls = [baselineHtml];
    for (const v of VARIANTS) {
      allHtmls.push(await readFile(join(DIR, v), "utf-8"));
    }
    const combined = allHtmls.join("\n");
    const discovery = discoverViewports(combined, {
      maxViewports: MAX_VIEWPORTS,
      randomSamples: RANDOM_SAMPLES,
    });
    VIEWPORTS = discovery.viewports;

    if (discovery.breakpoints.length > 0) {
      console.log();
      console.log(`  ${DIM}Discovered breakpoints: ${discovery.breakpoints.map((b) => `${b.type}:${b.value}px`).join(", ")}${RESET}`);
    }
  } else {
    VIEWPORTS = STATIC_VIEWPORTS;
  }

  console.log();
  console.log(`${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  Migration VRT Compare                                                  ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${DIM}Baseline: ${BASELINE}${RESET}`);
  console.log(`  ${DIM}Variants: ${VARIANTS.join(", ")}${RESET}`);
  console.log(`  ${DIM}Viewports (${VIEWPORTS.length}): ${VIEWPORTS.map((v) => `${v.label}(${v.width})`).join(", ")}${RESET}`);
  console.log();

  const browser = await chromium.launch();

  // Capture baseline at all viewports
  const baselineScreenshots = new Map<string, string>();
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.setContent(baselineHtml, { waitUntil: "networkidle" });
    const path = join(TMP, `${baselineName}-${vp.label}.png`);
    await page.screenshot({ path, fullPage: true });
    baselineScreenshots.set(vp.label, path);
    await page.close();
  }

  // Compare each variant
  const results: Array<{
    variant: string;
    viewport: string;
    diffRatio: number;
    diffPixels: number;
    totalPixels: number;
  }> = [];

  for (const variantFile of VARIANTS) {
    const variantPath = join(DIR, variantFile);
    const variantHtml = await readFile(variantPath, "utf-8");
    const variantName = basename(variantFile, ".html");

    console.log(`  ${BOLD}${variantName}${RESET} vs ${baselineName}`);

    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.setContent(variantHtml, { waitUntil: "networkidle" });
      const variantScreenshotPath = join(TMP, `${variantName}-${vp.label}.png`);
      await page.screenshot({ path: variantScreenshotPath, fullPage: true });
      await page.close();

      const snap: VrtSnapshot = {
        testId: `${variantName}-${vp.label}`,
        testTitle: `${variantName} ${vp.label}`,
        projectName: "migration",
        screenshotPath: variantScreenshotPath,
        baselinePath: baselineScreenshots.get(vp.label)!,
        status: "changed",
      };
      const diff = await compareScreenshots(snap, { outputDir: TMP });
      const diffRatio = diff?.diffRatio ?? 0;
      const diffPixels = diff?.diffPixels ?? 0;
      const totalPixels = diff?.totalPixels ?? 0;

      results.push({ variant: variantName, viewport: vp.label, diffRatio, diffPixels, totalPixels });

      const pct = (diffRatio * 100).toFixed(1);
      const icon = diffRatio === 0 ? `${GREEN}✓${RESET}` : diffRatio < 0.01 ? `${YELLOW}~${RESET}` : `${RED}✗${RESET}`;
      process.stdout.write(`    ${icon} ${vp.label.padEnd(12)} ${pct}%`);
      if (diffRatio > 0) process.stdout.write(` ${DIM}(${diffPixels} px)${RESET}`);
      console.log();
    }
    console.log();
  }

  await browser.close();

  // Summary table
  hr();
  console.log();
  console.log(`  ${BOLD}Summary${RESET}`);
  console.log();

  // Matrix: variant × viewport
  const vpLabels = VIEWPORTS.map((v) => v.label);
  const header = "  " + "Variant".padEnd(20) + vpLabels.map((l) => l.padStart(10)).join("");
  console.log(header);

  const variantNames = [...new Set(results.map((r) => r.variant))];
  for (const v of variantNames) {
    let line = "  " + v.padEnd(20);
    let allZero = true;
    for (const vp of vpLabels) {
      const r = results.find((r) => r.variant === v && r.viewport === vp);
      const pct = r ? (r.diffRatio * 100).toFixed(1) + "%" : "n/a";
      const color = !r ? DIM : r.diffRatio === 0 ? GREEN : r.diffRatio < 0.01 ? YELLOW : RED;
      line += `${color}${pct.padStart(10)}${RESET}`;
      if (r && r.diffRatio > 0) allZero = false;
    }
    if (allZero) line += `  ${GREEN}PASS${RESET}`;
    console.log(line);
  }
  console.log();

  // Save JSON report
  const reportPath = join(TMP, "migration-report.json");
  await writeFile(reportPath, JSON.stringify({ baseline: BASELINE, variants: VARIANTS, viewports: VIEWPORTS, results }, null, 2));
  console.log(`  ${DIM}Report: ${reportPath}${RESET}`);
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
