#!/usr/bin/env node
/**
 * VRT Snapshot -- capture URLs at multiple viewports, auto-compare with previous
 *
 * Usage:
 *   vrt snapshot http://localhost:4156/todomvc --output snapshots/luna/
 *   vrt snapshot http://localhost:3000/ http://localhost:3000/luna/ --output snapshots/sol/
 */
import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";
import { compareScreenshots, generateDiffReport } from "./heatmap.ts";
import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD, hr } from "./terminal-colors.ts";
import { applyMask } from "./mask.ts";
import { approveSnapshotsFromReport } from "./snapshot-approve.ts";
import { determineSnapshotExitCode, parseSnapshotCliArgs, parseSnapshotConfig, type SnapshotConfig } from "./snapshot-cli.ts";
import type { VrtSnapshot } from "./types.ts";

const DEFAULT_SNAPSHOT_CONFIG_FILE = "vrt.config.json";
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

function formatSnapshotUsage(): string {
  return [
    "Usage:",
    "  vrt snapshot <url1> [url2] ... [--output dir] [--label name] [--threshold 0.1] [--fail-on-diff] [--fail-on-new-baseline] [--max-diff-ratio n] [--config vrt.config.json]",
    "  vrt snapshot approve [--output dir] [--label name] [--config vrt.config.json]",
  ].join("\n");
}

function findSnapshotConfigPath(cliArgs: string[], cwd: string): string | undefined {
  for (let i = 0; i < cliArgs.length; i++) {
    if (cliArgs[i] === "--config") {
      const value = cliArgs[i + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }
      return resolve(cwd, value);
    }
  }

  const defaultPath = resolve(cwd, DEFAULT_SNAPSHOT_CONFIG_FILE);
  return existsSync(defaultPath) ? defaultPath : undefined;
}

async function loadSnapshotConfigForCli(cliArgs: string[], cwd: string): Promise<{
  config: SnapshotConfig;
  configPath?: string;
}> {
  const configPath = findSnapshotConfigPath(cliArgs, cwd);
  if (!configPath) {
    return { config: {} };
  }

  const raw = await readFile(configPath, "utf-8");
  const config = parseSnapshotConfig(raw);
  if (config.outputDir && !config.outputDir.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(config.outputDir)) {
    config.outputDir = resolve(dirname(configPath), config.outputDir);
  }
  return { config, configPath };
}

async function approve(options: {
  outputDir: string;
  labels: string[];
  configPath?: string;
}) {
  const reportPath = join(options.outputDir, "snapshot-report.json");
  let result: Awaited<ReturnType<typeof approveSnapshotsFromReport>>;
  try {
    result = await approveSnapshotsFromReport(reportPath, options.labels);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No snapshot report found at ${reportPath}. Run \`vrt snapshot <url...>\` first.`);
    }
    throw error;
  }

  console.log();
  console.log(`${BOLD}${CYAN}Snapshot Approve${RESET}`);
  console.log(`  ${DIM}Output: ${options.outputDir}${RESET}`);
  if (options.configPath) {
    console.log(`  ${DIM}Config: ${options.configPath}${RESET}`);
  }
  if (options.labels.length > 0) {
    console.log(`  ${DIM}Labels: ${options.labels.join(", ")}${RESET}`);
  }
  console.log();
  for (const entry of result.entries) {
    console.log(`  ${GREEN}${entry.label}${RESET} ${DIM}${entry.viewport}${RESET}`);
  }
  console.log();
  console.log(`  ${GREEN}Approved baselines:${RESET} ${result.updated}`);
  console.log(`  ${DIM}Report: ${reportPath}${RESET}`);
  console.log();
}

async function main() {
  const cliArgs = process.argv.slice(2);
  if (cliArgs.length === 0 || cliArgs.includes("--help") || cliArgs.includes("-h") || cliArgs.includes("help")) {
    console.log(formatSnapshotUsage());
    process.exit(cliArgs.length === 0 ? 1 : 0);
  }

  const cwd = process.cwd();
  const { config, configPath } = await loadSnapshotConfigForCli(cliArgs, cwd);
  const parsed = parseSnapshotCliArgs(cliArgs, config, cwd);
  const outputDir = resolve(parsed.outputDir);

  if (parsed.mode === "approve") {
    await approve({ outputDir, labels: parsed.labels, configPath });
    return;
  }

  const urls = parsed.urls;
  if (urls.length === 0) {
    console.log(formatSnapshotUsage());
    throw new Error("No snapshot URLs provided. Pass URLs directly or configure routes in vrt.config.json.");
  }
  const labels = parsed.labels;

  await mkdir(outputDir, { recursive: true });

  console.log();
  console.log(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  VRT Snapshot                                                        ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${DIM}URLs: ${urls.length} | Viewports: ${VIEWPORTS.map((v) => v.label).join(", ")} | Output: ${outputDir}${RESET}`);
  console.log(`  ${DIM}Threshold: ${parsed.threshold}${RESET}`);
  if (configPath) {
    console.log(`  ${DIM}Config: ${configPath}${RESET}`);
  }
  if (parsed.maskSelectors.length > 0) {
    console.log(`  ${DIM}Mask: ${parsed.maskSelectors.join(", ")}${RESET}`);
  }
  console.log();

  const browser = await chromium.launch();
  const results: SnapshotResult[] = [];

  try {
    for (const [index, url] of urls.entries()) {
      const label = labels[index]!;
      console.log(`  ${BOLD}${label}${RESET} ${DIM}(${url})${RESET}`);

      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await applyMask(page, parsed.maskSelectors);

        const currentPath = join(outputDir, `${label}-${vp.label}-current.png`);
        await page.screenshot({ path: currentPath, fullPage: true });

        // Save HTML on first viewport only
        if (vp === VIEWPORTS[0]) {
          const html = await page.content();
          await writeFile(join(outputDir, `${label}.html`), html);
        }

        await page.close();

        // Check for previous baseline
        const baselinePath = join(outputDir, `${label}-${vp.label}-baseline.png`);
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
          const diff = await compareScreenshots(snap, { outputDir, threshold: parsed.threshold });
          const diffRatio = diff?.diffRatio ?? 0;

          // Shift detection for enhanced analysis
          const report = diffRatio > 0
            ? await generateDiffReport(snap, { outputDir, detectShift: true, threshold: parsed.threshold })
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

  const exitStatus = determineSnapshotExitCode(results, {
    failOnDiff: parsed.failOnDiff,
    failOnNewBaseline: parsed.failOnNewBaseline,
    maxDiffRatio: parsed.maxDiffRatio,
  });

  // Write JSON summary
  await writeFile(
    join(outputDir, "snapshot-report.json"),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      urls,
      labels,
      options: {
        threshold: parsed.threshold,
        failOnDiff: parsed.failOnDiff,
        failOnNewBaseline: parsed.failOnNewBaseline,
        maxDiffRatio: parsed.maxDiffRatio ?? null,
        configPath: configPath ?? null,
      },
      results,
      exitStatus,
    }, null, 2),
  );

  console.log();
  console.log(`  ${DIM}Report: ${join(outputDir, "snapshot-report.json")}${RESET}`);
  if (exitStatus.reasons.length > 0) {
    console.log();
    console.log(`  ${RED}Snapshot failed:${RESET}`);
    for (const reason of exitStatus.reasons) {
      console.log(`    ${RED}- ${reason}${RESET}`);
    }
    process.exitCode = exitStatus.exitCode;
  }
  console.log();
}

if (process.argv[1]?.endsWith("snapshot.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
