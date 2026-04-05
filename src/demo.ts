#!/usr/bin/env node
/**
 * VRT Demo Script
 *
 * kitty graphics protocol で画像をインライン表示しながら、
 * fixture シナリオを順に実行して VRT パイプラインをデモする。
 *
 * Usage: npx tsx vrt/src/demo.ts
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot } from "./a11y-semantic.ts";
import { reasonAboutChanges } from "./reasoning.ts";
import { matchA11yExpectation } from "./expectation.ts";
import { introspectToSpec, verifySpec } from "./introspect.ts";
import { compareScreenshots, encodePng } from "./heatmap.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import type { A11yNode, PageExpectation, ChangeIntent, VrtSnapshot } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");
const TMP = join(import.meta.dirname!, "..", "test-results", "demo");

// ---- Kitty Graphics Protocol ----

function kittyShow(pngBuffer: Buffer, opts: { width?: number; id?: number } = {}) {
  const b64 = pngBuffer.toString("base64");
  const cols = opts.width ?? 40;
  // Chunked transfer for large images
  const chunkSize = 4096;
  for (let i = 0; i < b64.length; i += chunkSize) {
    const chunk = b64.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= b64.length;
    if (i === 0) {
      process.stdout.write(`\x1b_Ga=T,f=100,c=${cols},m=${isLast ? 0 : 1};${chunk}\x1b\\`);
    } else {
      process.stdout.write(`\x1b_Gm=${isLast ? 0 : 1};${chunk}\x1b\\`);
    }
  }
  process.stdout.write("\n");
}

async function showPngFile(path: string, label?: string) {
  if (label) console.log(`  ${label}`);
  try {
    const buf = await readFile(path);
    kittyShow(buf);
  } catch {
    console.log("  (image not available)");
  }
}

// ---- PNG Generation (simple mock UI) ----

type Rect = { x: number; y: number; w: number; h: number; r: number; g: number; b: number };

function createPng(width: number, height: number, regions: Rect[], bg = { r: 245, g: 245, b: 250 }) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bg.r; data[i * 4 + 1] = bg.g; data[i * 4 + 2] = bg.b; data[i * 4 + 3] = 255;
  }
  for (const r of regions) {
    for (let y = r.y; y < Math.min(r.y + r.h, height); y++) {
      for (let x = r.x; x < Math.min(r.x + r.w, width); x++) {
        const i = (y * width + x) * 4;
        data[i] = r.r; data[i + 1] = r.g; data[i + 2] = r.b; data[i + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

// UI パーツ
const HEADER = (hasNav: boolean): Rect[] => [
  { x: 0, y: 0, w: 320, h: 32, r: 36, g: 41, b: 46 },         // header bg
  { x: 8, y: 8, w: 60, h: 16, r: 88, g: 166, b: 255 },        // logo
  ...(hasNav ? [
    { x: 80, y: 10, w: 30, h: 12, r: 200, g: 200, b: 210 },   // nav link 1
    { x: 118, y: 10, w: 30, h: 12, r: 200, g: 200, b: 210 },  // nav link 2
    { x: 156, y: 10, w: 30, h: 12, r: 200, g: 200, b: 210 },  // nav link 3
  ] : []),
];

const FORM = (color: { r: number; g: number; b: number }): Rect[] => [
  { x: 40, y: 80, w: 240, h: 100, r: 255, g: 255, b: 255 },    // form bg
  { x: 50, y: 90, w: 220, h: 24, r: 240, g: 240, b: 245 },     // input 1
  { x: 50, y: 120, w: 220, h: 24, r: 240, g: 240, b: 245 },    // input 2
  { x: 50, y: 152, w: 220, h: 24, ...color },                    // button
];

const HEADING: Rect[] = [
  { x: 40, y: 45, w: 180, h: 20, r: 30, g: 30, b: 30 },        // heading text
];

const SEARCH_BOX: Rect[] = [
  { x: 200, y: 8, w: 100, h: 16, r: 60, g: 60, b: 70 },        // search input
  { x: 306, y: 8, w: 14, h: 16, r: 100, g: 180, b: 100 },      // search btn
];

// ---- Scenarios ----

interface DemoScenario {
  name: string;
  description: string;
  snapshotFile: string;
  baselineRegions: Rect[];
  snapshotRegions: Rect[];
  expectation: PageExpectation;
  intent: ChangeIntent;
}

const scenarios: DemoScenario[] = [
  {
    name: "1. Style Change: Button Color",
    description: "ボタンの色を青→緑に変更。A11y 変化なし。",
    snapshotFile: "snapshot-style-only.a11y.json",
    baselineRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    snapshotRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    expectation: { testId: "home", expect: "No a11y changes, visual only", a11y: "no-change" },
    intent: { summary: "style: change button color", changeType: "style", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
  },
  {
    name: "2. Nav Removed (Intentional)",
    description: "トップページからナビゲーションを意図的に削除。",
    snapshotFile: "snapshot-nav-removed.a11y.json",
    baselineRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    snapshotRegions: [...HEADER(false), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    expectation: {
      testId: "home",
      expect: "Navigation removed from header",
      expectedA11yChanges: [{ description: "Navigation landmark removed" }],
    },
    intent: { summary: "style: hide nav on home", changeType: "style", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
  },
  {
    name: "3. Search Added (Feature)",
    description: "ヘッダーに検索フォームを追加。",
    snapshotFile: "snapshot-search-added.a11y.json",
    baselineRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    snapshotRegions: [...HEADER(true), ...SEARCH_BOX, ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    expectation: {
      testId: "home",
      expect: "Search landmark added",
      expectedA11yChanges: [{ description: "Search landmark added" }],
    },
    intent: { summary: "feat: add search", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
  },
  {
    name: "4. Labels Broken (Regression)",
    description: "リファクタリングでフォームのラベルが消失。意図しない破壊。",
    snapshotFile: "snapshot-label-broken.a11y.json",
    baselineRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    snapshotRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 180, g: 40, b: 40 })], // red = broken
    expectation: { testId: "home", expect: "No changes expected in refactor", a11y: "no-change" },
    intent: { summary: "refactor: extract utils", changeType: "refactor", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
  },
  {
    name: "5. A11y Fixed (Improvement)",
    description: "壊れたラベルを修正。A11y 改善。",
    snapshotFile: "snapshot-a11y-fixed.a11y.json",
    baselineRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 180, g: 40, b: 40 })],
    snapshotRegions: [...HEADER(true), ...HEADING, ...FORM({ r: 35, g: 134, b: 54 })],
    expectation: {
      testId: "home",
      expect: "Form elements get labels",
      expectedA11yChanges: [
        { description: "Form gets name" },
        { description: "Email textbox gets label", role: "textbox" },
        { description: "Message textbox gets label", role: "textbox" },
        { description: "Button gets label" },
      ],
    },
    intent: { summary: "a11y: fix form labels", changeType: "a11y", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
  },
];

// ---- Main ----

import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD, hr } from "./terminal-colors.ts";

function separator() {
  hr(60);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await mkdir(TMP, { recursive: true });

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  VRT + Semantic Verification Demo                ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}\n`);

  const baseline = JSON.parse(await readFile(join(FIXTURES, "baseline.a11y.json"), "utf-8"));

  for (const sc of scenarios) {
    separator();
    console.log(`\n${BOLD}${sc.name}${RESET}`);
    console.log(`${DIM}${sc.description}${RESET}\n`);

    // Generate & show mock screenshots
    const basePng = createPng(320, 200, sc.baselineRegions);
    const snapPng = createPng(320, 200, sc.snapshotRegions);
    const basePath = join(TMP, `${sc.name}-base.png`);
    const snapPath = join(TMP, `${sc.name}-snap.png`);
    await encodePng(basePath, basePng);
    await encodePng(snapPath, snapPng);

    console.log(`  ${DIM}Baseline:${RESET}`);
    await showPngFile(basePath);

    console.log(`  ${DIM}Snapshot:${RESET}`);
    await showPngFile(snapPath);

    // Visual diff + heatmap
    const snapshot: VrtSnapshot = {
      testId: sc.name, testTitle: sc.name, projectName: "demo",
      screenshotPath: snapPath, baselinePath: basePath, status: "changed",
    };
    const vrtDiff = await compareScreenshots(snapshot, { outputDir: TMP });
    if (vrtDiff && vrtDiff.diffPixels > 0) {
      console.log(`  ${DIM}Heatmap (${(vrtDiff.diffRatio * 100).toFixed(1)}% changed):${RESET}`);
      if (vrtDiff.heatmapPath) await showPngFile(vrtDiff.heatmapPath);
      const semantic = classifyVisualDiff(vrtDiff);
      console.log(`  ${DIM}Visual Semantic: ${semantic.summary}${RESET}`);
    } else {
      console.log(`  ${DIM}Visual: no pixel diff${RESET}`);
    }

    // A11y diff
    const snapshotTree = JSON.parse(await readFile(join(FIXTURES, sc.snapshotFile), "utf-8"));
    const baseSnap = parsePlaywrightA11ySnapshot("home", "home", baseline as any);
    const snapSnap = parsePlaywrightA11ySnapshot("home", "home", snapshotTree as any);
    const a11yDiff = diffA11yTrees(baseSnap, snapSnap);

    if (a11yDiff.changes.length > 0) {
      console.log(`\n  ${BOLD}A11y Diff:${RESET} ${a11yDiff.changes.length} change(s)${a11yDiff.hasRegression ? ` ${RED}(REGRESSION)${RESET}` : ""}`);
      for (const c of a11yDiff.changes.slice(0, 5)) {
        const icon = c.severity === "error" ? RED + "✗" : c.severity === "warning" ? YELLOW + "~" : DIM + "·";
        console.log(`    ${icon}${RESET} [${c.type}] ${c.description}`);
      }
    } else {
      console.log(`\n  ${BOLD}A11y Diff:${RESET} ${GREEN}no changes${RESET}`);
    }

    // Expectation match
    const match = matchA11yExpectation(sc.expectation, a11yDiff.changes.length > 0 ? a11yDiff : undefined);
    const matchIcon = match.matched ? `${GREEN}✓ MATCHED${RESET}` : `${RED}✗ MISMATCH${RESET}`;
    console.log(`\n  ${BOLD}Expectation:${RESET} ${matchIcon}`);
    console.log(`  ${DIM}${match.reasoning}${RESET}`);

    // Reasoning chain
    const chain = reasonAboutChanges("home", sc.expectation, a11yDiff.changes.length > 0 ? a11yDiff : undefined, sc.intent);
    const verdictColor = chain.verdict === "realized" ? GREEN
      : chain.verdict === "unexpected-side-effects" ? YELLOW
      : chain.verdict === "not-realized" ? RED : DIM;
    console.log(`\n  ${BOLD}Verdict:${RESET} ${verdictColor}${chain.verdict.toUpperCase()}${RESET}`);

    for (const m of chain.mappings) {
      const icon = m.realized ? `${GREEN}+${RESET}` : `${RED}-${RESET}`;
      console.log(`    ${icon} ${m.expected}`);
      if (m.actual) console.log(`      ${DIM}↔ ${m.actual}${RESET}`);
    }

    console.log();
    await sleep(300);
  }

  separator();
  console.log(`\n${BOLD}${CYAN}Demo complete.${RESET} ${DIM}150 tests, 10 fixture scenarios, 5 demo scenarios.${RESET}\n`);

  // Cleanup
  await rm(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
