#!/usr/bin/env node
/**
 * CSS Recovery Challenge — Benchmark Runner
 *
 * 複数 seed でチャレンジを実行し、検出率・復元率を計測する。
 * multi-viewport (desktop + mobile) 対応。結果を JSONL に蓄積。
 *
 * Usage:
 *   npx tsx src/css-challenge-bench.ts [--trials 20] [--start-seed 1]
 *   npx tsx src/css-challenge-bench.ts --trials 30 --no-db
 *   ANTHROPIC_API_KEY=... npx tsx src/css-challenge-bench.ts --trials 10
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseCssDeclarations, removeCssProperty, applyCssFix, normalizeValue,
  seededRandom, createBrowser, createCraterClient, capturePageState, capturePageStateCrater, analyzeVrtDiff,
  buildFixPrompt, parseLLMFix, categorizeProperty,
  extractCss, replaceCss,
  type CssDeclaration, type CapturedState, type TrialResult, type RenderBackend,
} from "./css-challenge-core.ts";
import { isCraterAvailable, type CraterClient } from "./crater-client.ts";
import { classifyDeclaration, classifyUndetectedReason, isOutOfScope, type ViewportDetectionResult } from "./detection-classify.ts";
import { appendRecords, type DetectionRecord } from "./detection-db.ts";
import { createLLMProvider } from "./llm-client.ts";

// ---- Config ----

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
function hasFlag(name: string): boolean { return args.includes(`--${name}`); }

const TRIALS = parseInt(getArg("trials", "20"), 10);
const START_SEED = parseInt(getArg("start-seed", "1"), 10);
const SAVE_DB = !hasFlag("no-db");
const FIXTURE = getArg("fixture", "page");
const BACKEND = getArg("backend", "chromium") as RenderBackend;
const FIXTURE_DIR = join(import.meta.dirname!, "..", "fixtures", "css-challenge");
const FIXTURE_PATH = join(FIXTURE_DIR, `${FIXTURE}.html`);
const TMP = join(import.meta.dirname!, "..", "test-results", "css-bench");

const VIEWPORTS = [
  { width: 1440, height: 900, label: "wide" },
  { width: 1280, height: 900, label: "desktop" },
  { width: 375, height: 812, label: "mobile" },
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
  await mkdir(TMP, { recursive: true });

  const htmlRaw = await readFile(FIXTURE_PATH, "utf-8");
  const originalCss = extractCss(htmlRaw);
  if (!originalCss) { console.error("CSS not found"); process.exit(1); }

  const declarations = parseCssDeclarations(originalCss);
  const llm = createLLMProvider();

  console.log();
  console.log(`${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  CSS Recovery Challenge — Benchmark                                     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${DIM}Fixture: ${FIXTURE} | Trials: ${TRIALS} | Start seed: ${START_SEED} | CSS declarations: ${declarations.length}${RESET}`);
  console.log(`  ${DIM}Backend: ${BACKEND} | Viewports: ${VIEWPORTS.map((v) => `${v.label}(${v.width}x${v.height})`).join(", ")}${RESET}`);
  console.log(`  ${DIM}LLM: ${llm ? "enabled" : "disabled"} | DB: ${SAVE_DB ? "enabled" : "disabled"}${RESET}`);
  console.log();

  // Check crater availability
  let craterClient: CraterClient | null = null;
  if (BACKEND === "crater") {
    if (!await isCraterAvailable()) {
      console.log(`  ${RED}Crater BiDi server not available at ws://127.0.0.1:9222${RESET}`);
      console.log(`  ${DIM}Start it: cd ~/ghq/github.com/mizchi/crater && just build-bidi && just start-bidi-with-font${RESET}`);
      process.exit(1);
    }
    craterClient = await createCraterClient();
  }

  // Capture baselines for each viewport
  const { browser } = BACKEND === "chromium" ? await createBrowser() : { browser: null as unknown as import("playwright").Browser };
  const baselines = new Map<string, CapturedState>();
  for (const vp of VIEWPORTS) {
    const path = join(TMP, `baseline-${vp.label}.png`);
    if (BACKEND === "crater" && craterClient) {
      baselines.set(vp.label, await capturePageStateCrater(craterClient, vp, htmlRaw, path));
    } else {
      baselines.set(vp.label, await capturePageState(browser, vp, htmlRaw, path, { captureHover: true }));
    }
  }

  const results: TrialResult[] = [];
  const dbRecords: DetectionRecord[] = [];
  const runId = new Date().toISOString();
  const startTime = Date.now();

  const shuffled = shuffleWithSeed(declarations, START_SEED);

  for (let i = 0; i < TRIALS; i++) {
    const seed = START_SEED + i;
    const removed = shuffled[i % shuffled.length];

    const trialDir = join(TMP, `trial-${seed}`);
    await mkdir(trialDir, { recursive: true });

    process.stdout.write(`  [${String(i + 1).padStart(3)}/${TRIALS}] seed=${seed} ${removed.selector} { ${removed.property} } ... `);

    const brokenCss = removeCssProperty(originalCss, removed);
    const brokenHtml = replaceCss(htmlRaw, originalCss, brokenCss);
    const classified = classifyDeclaration(removed.selector, removed.mediaCondition);

    // Multi-viewport detection
    const vpResults: ViewportDetectionResult[] = [];
    let anyVisual = false;
    let anyA11y = false;
    let maxDiffRatio = 0;
    let totalA11yChanges = 0;
    let primaryAnalysis = null;

    let anyComputed = false;
    let anyHover = false;
    let anyPaintTree = false;

    for (const vp of VIEWPORTS) {
      const brokenPath = join(trialDir, `broken-${vp.label}.png`);
      const brokenState = BACKEND === "crater" && craterClient
        ? await capturePageStateCrater(craterClient, vp, brokenHtml, brokenPath)
        : await capturePageState(browser, vp, brokenHtml, brokenPath, { captureHover: classified.isInteractive });
      const baseline = baselines.get(vp.label)!;
      const analysis = await analyzeVrtDiff(baseline, brokenState, trialDir);

      const visDetected = (analysis.vrtDiff?.diffPixels ?? 0) > 0;
      const a11yDetected = analysis.a11yDiff.changes.length > 0;
      const diffRatio = analysis.vrtDiff?.diffRatio ?? 0;
      const cssDiffCount = analysis.computedStyleDiffs.length;

      const paintTreeDiffCount = analysis.paintTreeChanges.length;

      vpResults.push({
        width: vp.width,
        height: vp.height,
        visualDiffDetected: visDetected,
        visualDiffRatio: diffRatio,
        a11yDiffDetected: a11yDetected,
        a11yChangeCount: analysis.a11yDiff.changes.length,
        computedStyleDiffCount: cssDiffCount,
        hoverDiffDetected: analysis.hoverDiffDetected,
        paintTreeDiffCount,
      });

      if (visDetected) anyVisual = true;
      if (a11yDetected) anyA11y = true;
      if (cssDiffCount > 0) anyComputed = true;
      if (analysis.hoverDiffDetected) anyHover = true;
      if (paintTreeDiffCount > 0) anyPaintTree = true;
      if (diffRatio > maxDiffRatio) maxDiffRatio = diffRatio;
      totalA11yChanges += analysis.a11yDiff.changes.length;

      // Use desktop analysis for LLM prompt
      if (vp.label === "desktop") primaryAnalysis = analysis;
    }

    const detected = anyVisual || anyA11y || anyComputed || anyHover || anyPaintTree;

    const result: TrialResult = {
      seed,
      removed,
      visualDiffDetected: anyVisual,
      visualDiffRatio: maxDiffRatio,
      visualChangeTypes: primaryAnalysis?.visualSemantic?.changes.map((c) => c.type) ?? [],
      a11yDiffDetected: anyA11y,
      a11yChangeCount: totalA11yChanges,
      newA11yIssues: primaryAnalysis ? Math.max(0, primaryAnalysis.brokenIssueCount - primaryAnalysis.baselineIssueCount) : 0,
      llmAttempted: false,
      llmFixParsed: false,
      selectorMatch: false,
      propertyMatch: false,
      valueMatch: false,
      exactMatch: false,
      pixelPerfect: false,
      nearPerfect: false,
      fixedDiffRatio: -1,
      attempts: 0,
      llmMs: 0,
    };

    // LLM fix attempt (desktop viewport)
    if (llm && primaryAnalysis) {
      result.llmAttempted = true;
      const prompt = buildFixPrompt(primaryAnalysis.fullReport, brokenCss);
      const llmStart = Date.now();
      try {
        const response = await llm.complete(prompt);
        result.llmMs = Date.now() - llmStart;
        const fix = parseLLMFix(response);
        result.attempts = 1;
        if (fix) {
          result.llmFixParsed = true;
          result.selectorMatch = fix.selector === removed.selector;
          result.propertyMatch = fix.property === removed.property;
          result.valueMatch = normalizeValue(fix.value) === normalizeValue(removed.value);
          result.exactMatch = result.selectorMatch && result.propertyMatch && result.valueMatch;

          const fixedCss = applyCssFix(brokenCss, fix);
          const fixedHtml = replaceCss(htmlRaw, originalCss, fixedCss);
          const fixedPath = join(trialDir, "fixed.png");
          const desktopVp = VIEWPORTS[0];
          await capturePageState(browser, desktopVp, fixedHtml, fixedPath);
          const { compareScreenshots } = await import("./heatmap.ts");
          const fixedDiff = await compareScreenshots({
            testId: "page", testTitle: "page", projectName: "css-challenge",
            screenshotPath: fixedPath, baselinePath: baselines.get("desktop")!.screenshotPath, status: "changed",
          }, { outputDir: trialDir });
          result.fixedDiffRatio = fixedDiff?.diffRatio ?? 0;
          result.pixelPerfect = result.fixedDiffRatio === 0;
          result.nearPerfect = result.fixedDiffRatio < 0.01;
        }
      } catch {
        result.llmMs = Date.now() - llmStart;
      }
    }

    results.push(result);

    // Build detection record
    const undetectedReason = detected
      ? null
      : classifyUndetectedReason(removed.selector, removed.property, removed.value, removed.mediaCondition, vpResults);

    dbRecords.push({
      runId,
      fixture: FIXTURE,
      backend: BACKEND,
      selector: removed.selector,
      property: removed.property,
      value: removed.value,
      category: categorizeProperty(removed.property),
      selectorType: classified.selectorType,
      isInteractive: classified.isInteractive,
      mediaCondition: removed.mediaCondition,
      viewports: vpResults,
      detected,
      undetectedReason,
    });

    // Status line
    const status: string[] = [];
    for (const vr of vpResults) {
      const label = vr.width >= 1440 ? "W" : vr.width > 500 ? "D" : "M";
      if (vr.visualDiffDetected) status.push(`${label}:${(vr.visualDiffRatio * 100).toFixed(0)}%`);
      else status.push(`${label}:-`);
    }
    if (result.a11yDiffDetected) status.push(`a11y:${result.a11yChangeCount}`);
    if (anyComputed && !anyVisual) status.push(`${CYAN}css-diff${RESET}`);
    if (anyHover && !anyVisual) status.push(`${CYAN}hover${RESET}`);
    if (anyPaintTree && !anyVisual) status.push(`${CYAN}paint-tree${RESET}`);
    if (!detected) status.push(`${RED}silent${RESET}${undetectedReason ? `(${undetectedReason})` : ""}`);
    if (result.llmAttempted) {
      if (result.exactMatch) status.push(`${GREEN}exact${RESET}`);
      else if (result.pixelPerfect) status.push(`${GREEN}pixel-ok${RESET}`);
      else if (result.selectorMatch) status.push(`${YELLOW}partial${RESET}`);
      else status.push(`${RED}miss${RESET}`);
    }
    console.log(status.join(" | "));

    await rm(trialDir, { recursive: true, force: true }).catch(() => {});
  }

  if (BACKEND === "crater" && craterClient) {
    await craterClient.close();
  } else {
    await browser.close();
  }
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ============================================================
  // Report
  // ============================================================
  console.log();
  hr();
  console.log();
  console.log(`  ${BOLD}${CYAN}Benchmark Results${RESET}  ${DIM}(${TRIALS} trials, ${elapsed}s, ${VIEWPORTS.length} viewports)${RESET}`);
  console.log();

  // Detection metrics
  const visualDetected = results.filter((r) => r.visualDiffDetected).length;
  const a11yDetected = results.filter((r) => r.a11yDiffDetected).length;
  const eitherDetected = dbRecords.filter((r) => r.detected).length;
  const neitherDetected = dbRecords.filter((r) => !r.detected).length;

  const computedDetected = dbRecords.filter((r) => r.viewports.some((v) => v.computedStyleDiffCount > 0)).length;
  const hoverDetected = dbRecords.filter((r) => r.viewports.some((v) => v.hoverDiffDetected)).length;
  const paintTreeDetected = dbRecords.filter((r) => r.viewports.some((v) => v.paintTreeDiffCount > 0)).length;

  console.log(`  ${BOLD}Detection${RESET}`);
  console.log(`    Visual diff:           ${fmtRate(visualDetected, TRIALS)}`);
  console.log(`    Computed style diff:   ${fmtRate(computedDetected, TRIALS)}`);
  console.log(`    Hover diff:            ${fmtRate(hoverDetected, TRIALS)}`);
  if (paintTreeDetected > 0 || BACKEND === "crater") {
    console.log(`    Paint tree diff:       ${fmtRate(paintTreeDetected, TRIALS)}`);
  }
  console.log(`    A11y diff:             ${fmtRate(a11yDetected, TRIALS)}`);
  console.log(`    ${BOLD}Any signal:${RESET}            ${fmtRate(eitherDetected, TRIALS)}`);
  console.log(`    Undetected (silent):   ${fmtRate(neitherDetected, TRIALS, true)}`);

  // Scoped rate (excluding animation)
  const scoped = dbRecords.filter((r) => !isOutOfScope(r.property));
  const scopedDetected = scoped.filter((r) => r.detected).length;
  const scopedUndetected = scoped.filter((r) => !r.detected).length;
  if (scoped.length < dbRecords.length) {
    const outOfScope = dbRecords.length - scoped.length;
    console.log(`    ${DIM}(excl. animation: ${fmtRate(scopedDetected, scoped.length)} | ${outOfScope} animation skipped)${RESET}`);
  }
  console.log();

  // Viewport comparison
  console.log(`  ${BOLD}Detection by Viewport${RESET}`);
  for (const vp of VIEWPORTS) {
    const vpIdx = VIEWPORTS.indexOf(vp);
    const vpDetected = dbRecords.filter((r) => r.viewports[vpIdx]?.visualDiffDetected || r.viewports[vpIdx]?.a11yDiffDetected).length;
    console.log(`    ${vp.label.padEnd(10)} ${fmtRate(vpDetected, TRIALS)}`);
  }
  const multiOnly = dbRecords.filter((r) => {
    const desktopVp = r.viewports.find((v) => v.width > 1000);
    const mobileVp = r.viewports.find((v) => v.width <= 500);
    const desktopDetected = desktopVp ? (desktopVp.visualDiffDetected || desktopVp.a11yDiffDetected) : false;
    const mobileDetected = mobileVp ? (mobileVp.visualDiffDetected || mobileVp.a11yDiffDetected) : false;
    return r.detected && (!desktopDetected || !mobileDetected);
  }).length;
  console.log(`    ${DIM}multi-viewport bonus: ${multiOnly} additional detection(s)${RESET}`);
  console.log();

  // By category
  const categories = new Map<string, typeof dbRecords>();
  for (const r of dbRecords) {
    if (!categories.has(r.category)) categories.set(r.category, []);
    categories.get(r.category)!.push(r);
  }
  console.log(`  ${BOLD}Detection by Property Category${RESET}`);
  console.log(`    ${"Category".padEnd(14)} ${"Count".padStart(5)}  ${"Detect".padStart(8)}  ${"Silent".padStart(8)}`);
  for (const [cat, recs] of [...categories.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const det = recs.filter((r) => r.detected).length;
    const silent = recs.filter((r) => !r.detected).length;
    console.log(`    ${cat.padEnd(14)} ${String(recs.length).padStart(5)}  ${fmtRateCompact(det, recs.length).padStart(8)}  ${fmtRateCompact(silent, recs.length, true).padStart(8)}`);
  }
  console.log();

  // Undetected reasons
  const reasonCounts = new Map<string, number>();
  for (const r of dbRecords) {
    if (!r.detected && r.undetectedReason) {
      reasonCounts.set(r.undetectedReason, (reasonCounts.get(r.undetectedReason) ?? 0) + 1);
    }
  }
  if (reasonCounts.size > 0) {
    console.log(`  ${BOLD}${YELLOW}Undetected Reasons${RESET}`);
    for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      const examples = dbRecords.filter((r) => r.undetectedReason === reason).slice(0, 2);
      console.log(`    ${reason.padEnd(20)} ${String(count).padStart(3)}  ${DIM}${examples.map((e) => `${e.selector}{${e.property}}`).join(", ")}${RESET}`);
    }
    console.log();
  }

  // LLM recovery
  if (llm) {
    const attempted = results.filter((r) => r.llmAttempted);
    const exact = attempted.filter((r) => r.exactMatch);
    const pixelOk = attempted.filter((r) => r.pixelPerfect);
    const nearOk = attempted.filter((r) => r.nearPerfect);
    console.log(`  ${BOLD}LLM Recovery${RESET}`);
    console.log(`    Exact match:         ${fmtRate(exact.length, attempted.length)}`);
    console.log(`    Pixel-perfect fix:   ${fmtRate(pixelOk.length, attempted.length)}`);
    console.log(`    Near-perfect (<1%):  ${fmtRate(nearOk.length, attempted.length)}`);
    console.log();
  }

  // Persist to DB
  if (SAVE_DB) {
    await appendRecords(dbRecords);
    console.log(`  ${DIM}DB: ${dbRecords.length} records appended${RESET}`);
  }

  // JSON report
  const reportPath = join(TMP, "bench-report.json");
  const report = {
    meta: { trials: TRIALS, startSeed: START_SEED, elapsed, viewports: VIEWPORTS, llmEnabled: !!llm, totalDeclarations: declarations.length },
    detection: { visualDetected, a11yDetected, eitherDetected, neitherDetected, rate: eitherDetected / TRIALS },
    trials: dbRecords,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`  ${DIM}Report: ${reportPath}${RESET}`);
  console.log();
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rand = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function fmtRate(count: number, total: number, inverse = false): string {
  const pct = ((count / total) * 100).toFixed(1);
  const color = inverse
    ? (count === 0 ? GREEN : count <= total * 0.1 ? YELLOW : RED)
    : (count === total ? GREEN : count >= total * 0.9 ? YELLOW : count >= total * 0.5 ? YELLOW : RED);
  return `${color}${count}/${total}${RESET} ${DIM}(${pct}%)${RESET}`;
}

function fmtRateCompact(count: number, total: number, inverse = false): string {
  const pct = ((count / total) * 100).toFixed(0);
  const color = inverse
    ? (count === 0 ? GREEN : RED)
    : (count === total ? GREEN : count >= total * 0.5 ? YELLOW : RED);
  return `${color}${pct}%${RESET}`;
}

main().catch((e) => { console.error(e); process.exit(1); });
