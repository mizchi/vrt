#!/usr/bin/env node
/**
 * VRT Snapshot -- capture URLs at multiple viewports, auto-compare with previous
 *
 * Usage:
 *   vrt snapshot http://localhost:4156/todomvc --output snapshots/luna/
 *   vrt snapshot http://localhost:3000/ http://localhost:3000/luna/ --output snapshots/sol/
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { compareScreenshots, generateDiffReport } from "./heatmap.ts";
import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD, hr } from "./terminal-colors.ts";
import { getArg, getPositionalArgs, args } from "./cli-args.ts";
import { applyMask, parseMaskSelectors } from "./mask.ts";
import type { VrtSnapshot } from "./types.ts";

const OUTPUT_DIR = resolve(getArg("output", join(process.cwd(), "test-results", "snapshots")));
const MASK_SELECTORS = parseMaskSelectors(args);
const VIEWPORTS = [
  { width: 1280, height: 900, label: "desktop" },
  { width: 375, height: 812, label: "mobile" },
];

interface SnapshotResult {
  url: string;
  label: string;
  viewport: string;
  screenshotPath: string;
  baselinePath?: string;
  diffRatio?: number;
  isNew: boolean;
  globalShift?: number;
  compensatedDiffRatio?: number;
  shiftOnly?: boolean;
}

function urlToLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\//g, "_").replace(/^_|_$/g, "") || "root";
    return `${u.hostname}_${u.port || "80"}_${path}`.replace(/\.html$/, "");
  } catch {
    return "page";
  }
}

async function main() {
  const urls = getPositionalArgs();
  if (urls.length === 0) {
    console.log(`Usage: vrt snapshot <url1> [url2] ... [--output dir]`);
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log();
  console.log(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  VRT Snapshot                                                        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${DIM}URLs: ${urls.length} | Viewports: ${VIEWPORTS.map((v) => v.label).join(", ")} | Output: ${OUTPUT_DIR}${RESET}`);
  if (MASK_SELECTORS.length > 0) {
    console.log(`  ${DIM}Mask: ${MASK_SELECTORS.join(", ")}${RESET}`);
  }
  console.log();

  const browser = await chromium.launch();
  const results: SnapshotResult[] = [];

  try {
    for (const url of urls) {
      const label = urlToLabel(url);
      console.log(`  ${BOLD}${label}${RESET} ${DIM}(${url})${RESET}`);

      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await applyMask(page, MASK_SELECTORS);

        const currentPath = join(OUTPUT_DIR, `${label}-${vp.label}-current.png`);
        await page.screenshot({ path: currentPath, fullPage: true });

        // Save HTML on first viewport only
        if (vp === VIEWPORTS[0]) {
          const html = await page.content();
          await writeFile(join(OUTPUT_DIR, `${label}.html`), html);
        }

        await page.close();

        // Check for previous baseline
        const baselinePath = join(OUTPUT_DIR, `${label}-${vp.label}-baseline.png`);
        let hasBaseline = false;
        try {
          await access(baselinePath);
          hasBaseline = true;
        } catch { /* no baseline */ }

        if (hasBaseline) {
          const snap: VrtSnapshot = {
            testId: `${label}-${vp.label}`,
            testTitle: `${label} ${vp.label}`,
            projectName: "snapshot",
            screenshotPath: currentPath,
            baselinePath,
            status: "changed",
          };
          const diff = await compareScreenshots(snap, { outputDir: OUTPUT_DIR });
          const diffRatio = diff?.diffRatio ?? 0;

          // Shift detection for enhanced analysis
          const report = diffRatio > 0
            ? await generateDiffReport(snap, { outputDir: OUTPUT_DIR, detectShift: true })
            : null;
          const globalShift = report?.globalShift ?? 0;
          const compensatedDiffRatio = report ? report.compensatedDiffCount / report.totalPixels : diffRatio;
          const shiftOnly = report?.shiftOnly ?? false;

          let diffStr: string;
          if (diffRatio === 0) {
            diffStr = `${GREEN}0.0%${RESET}`;
          } else if (globalShift !== 0) {
            const rawPct = (diffRatio * 100).toFixed(2);
            const compPct = (compensatedDiffRatio * 100).toFixed(2);
            const color = compensatedDiffRatio < 0.01 ? YELLOW : RED;
            diffStr = `${color}${compPct}%${RESET} ${DIM}(raw ${rawPct}%, shift ${globalShift > 0 ? "+" : ""}${globalShift}px)${RESET}`;
          } else {
            diffStr = `${diffRatio < 0.01 ? YELLOW : RED}${(diffRatio * 100).toFixed(2)}%${RESET}`;
          }

          console.log(`    ${vp.label.padEnd(10)} ${diffStr}`);
          results.push({
            url, label, viewport: vp.label, screenshotPath: currentPath, baselinePath,
            diffRatio, isNew: false, globalShift, compensatedDiffRatio, shiftOnly,
          });
        } else {
          // First run: promote current to baseline
          const { copyFile } = await import("node:fs/promises");
          await copyFile(currentPath, baselinePath);
          console.log(`    ${vp.label.padEnd(10)} ${DIM}(new baseline)${RESET}`);
          results.push({ url, label, viewport: vp.label, screenshotPath: currentPath, isNew: true });
        }
      }
    }
  } finally {
    await browser.close();
  }

  // Summary
  console.log();
  hr();
  console.log();

  const compared = results.filter((r) => !r.isNew);
  const newBaselines = results.filter((r) => r.isNew);
  const falsePositives = compared.filter((r) => (r.diffRatio ?? 0) > 0);

  if (newBaselines.length > 0) {
    console.log(`  ${DIM}New baselines: ${newBaselines.length}${RESET}`);
  }
  if (compared.length > 0) {
    const fpRate = (falsePositives.length / compared.length * 100).toFixed(1);
    console.log(`  Compared: ${compared.length} | Diff > 0: ${falsePositives.length} (${fpRate}%)`);
    if (falsePositives.length > 0) {
      for (const fp of falsePositives) {
        console.log(`    ${RED}${fp.label} ${fp.viewport}: ${((fp.diffRatio ?? 0) * 100).toFixed(2)}%${RESET}`);
      }
    } else {
      console.log(`  ${GREEN}All snapshots match baseline${RESET}`);
    }
  }

  // Write JSON summary
  await writeFile(
    join(OUTPUT_DIR, "snapshot-report.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), urls, results }, null, 2),
  );

  console.log();
  console.log(`  ${DIM}Report: ${join(OUTPUT_DIR, "snapshot-report.json")}${RESET}`);
  console.log();
}

if (process.argv[1]?.endsWith("snapshot.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
