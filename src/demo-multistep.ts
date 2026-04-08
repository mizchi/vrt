#!/usr/bin/env node
/**
 * VRT Multi-Step Goal Demo
 *
 * 6-step Dashboard rebuild scenario.
 * Each step: detect issue -> AI diagnose -> fix -> next step.
 * Includes cascading issues where fixes cause new problems.
 *
 * Usage: ANTHROPIC_API_KEY=... npx tsx vrt/src/demo-multistep.ts
 */
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot, checkA11yTree } from "./a11y-semantic.ts";
import { reasonAboutChanges, type ReasoningChain } from "./reasoning.ts";
import { encodePng } from "./png-utils.ts";
import { createLLMProvider } from "./llm-client.ts";
import type { LLMProvider } from "./intent.ts";
import type { A11yNode, PageExpectation, ChangeIntent } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");
const TMP = join(import.meta.dirname!, "..", "test-results", "demo-multistep");

// ---- Terminal ----
const D = "\x1b[2m", R = "\x1b[0m", G = "\x1b[32m", RE = "\x1b[31m";
const Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m";
const BG_G = "\x1b[42m", BG_R = "\x1b[41m", BG_Y = "\x1b[43m";

function hr() { console.log(`${D}${"─".repeat(64)}${R}`); }
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function kittyShow(buf: Buffer, cols = 36) {
  const b64 = buf.toString("base64");
  const cs = 4096;
  for (let i = 0; i < b64.length; i += cs) {
    const chunk = b64.slice(i, i + cs);
    const last = i + cs >= b64.length;
    process.stdout.write(i === 0
      ? `\x1b_Ga=T,f=100,c=${cols},m=${last ? 0 : 1};${chunk}\x1b\\`
      : `\x1b_Gm=${last ? 0 : 1};${chunk}\x1b\\`);
  }
  process.stdout.write("\n");
}
async function showFile(path: string, label: string) {
  console.log(`    ${D}${label}${R}`);
  try { kittyShow(await readFile(path)); } catch { console.log("    (no image)"); }
}

// ---- PNG ----
type Rect = { x: number; y: number; w: number; h: number; r: number; g: number; b: number };
function mkPng(w: number, h: number, rects: Rect[], bg = { r: 245, g: 245, b: 250 }) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i*4]=bg.r;data[i*4+1]=bg.g;data[i*4+2]=bg.b;data[i*4+3]=255; }
  for (const r of rects) for (let y=r.y;y<Math.min(r.y+r.h,h);y++) for (let x=r.x;x<Math.min(r.x+r.w,w);x++) {
    const i=(y*w+x)*4; data[i]=r.r;data[i+1]=r.g;data[i+2]=r.b;data[i+3]=255;
  }
  return { width: w, height: h, data };
}
async function savePng(name: string, rects: Rect[]) {
  const p = join(TMP, name);
  await encodePng(p, mkPng(320, 200, rects));
  return p;
}

// UI parts
const HDR: Rect[] = [{ x:0,y:0,w:320,h:28,r:36,g:41,b:46 },{ x:8,y:6,w:50,h:16,r:88,g:166,b:255 }];
const TITLE: Rect[] = [{ x:16,y:34,w:120,h:16,r:30,g:30,b:30 }];
const TABS_BAD: Rect[] = [ // plain divs (no visual distinction)
  { x:16,y:56,w:60,h:20,r:220,g:220,b:225 },{ x:82,y:56,w:60,h:20,r:220,g:220,b:225 },{ x:148,y:56,w:60,h:20,r:220,g:220,b:225 },
];
const TABS_OK: Rect[] = [ // proper tabs with active indicator
  { x:16,y:56,w:60,h:20,r:88,g:166,b:255 },{ x:82,y:56,w:60,h:20,r:200,g:200,b:210 },{ x:148,y:56,w:60,h:20,r:200,g:200,b:210 },
  { x:16,y:76,w:60,h:2,r:88,g:166,b:255 }, // active indicator
];
const TABLE_BAD: Rect[] = [ // no header distinction
  { x:16,y:90,w:288,h:24,r:240,g:240,b:245 },
  { x:16,y:116,w:288,h:24,r:250,g:250,b:252 },
  { x:16,y:142,w:288,h:24,r:240,g:240,b:245 },
];
const TABLE_OK: Rect[] = [ // with header row
  { x:16,y:90,w:288,h:24,r:36,g:41,b:46 }, // header (dark)
  { x:16,y:116,w:288,h:24,r:250,g:250,b:252 },
  { x:16,y:142,w:288,h:24,r:240,g:240,b:245 },
];
const SEARCH_BAD: Rect[] = [{ x:16,y:82,w:200,h:20,r:220,g:220,b:225 }]; // no label indicator
const SEARCH_OK: Rect[] = [
  { x:16,y:82,w:60,h:10,r:100,g:100,b:110 }, // label
  { x:16,y:94,w:200,h:20,r:240,g:240,b:245 }, // input
  { x:222,y:94,w:50,h:20,r:88,g:166,b:255 }, // button
];

// ---- Helpers ----
async function loadTree(file: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, file), "utf-8"));
}
function diff(a: A11yNode, b: A11yNode) {
  return diffA11yTrees(
    parsePlaywrightA11ySnapshot("p","p",a as any),
    parsePlaywrightA11ySnapshot("p","p",b as any),
  );
}

async function callLLM(llm: LLMProvider | null, prompt: string, label: string): Promise<void> {
  if (!llm) { console.log(`    ${D}(AI skipped — set ANTHROPIC_API_KEY)${R}`); return; }
  console.log(`    ${D}Calling LLM...${R}`);
  const t = Date.now();
  const res = await llm.complete(prompt);
  console.log(`    ${B}${label}${R} ${D}(${Date.now()-t}ms)${R}:`);
  for (const line of res.split("\n")) console.log(`    ${line}`);
  console.log();
}

function printDiff(d: ReturnType<typeof diff>) {
  for (const c of d.changes.slice(0, 8)) {
    const icon = c.severity === "error" ? `${RE}✗${R}` : c.severity === "warning" ? `${Y}~${R}` : `${D}·${R}`;
    console.log(`    ${icon} [${c.type}] ${c.description}`);
  }
  if (d.changes.length > 8) console.log(`    ${D}+${d.changes.length - 8} more${R}`);
}

function printIssues(tree: A11yNode): number {
  const issues = checkA11yTree(tree);
  if (issues.length === 0) { console.log(`    ${G}✓ A11y: clean${R}`); return 0; }
  for (const i of issues.slice(0, 5)) console.log(`    ${RE}✗${R} ${i.rule}: ${i.message}`);
  if (issues.length > 5) console.log(`    ${D}+${issues.length - 5} more${R}`);
  return issues.length;
}

function printChain(chain: ReasoningChain) {
  const color = chain.verdict === "realized" ? G : chain.verdict === "not-realized" ? RE : Y;
  console.log(`    Verdict: ${color}${B}${chain.verdict.toUpperCase()}${R}`);
  for (const m of chain.mappings) {
    console.log(`    ${m.realized ? G+"✓" : RE+"✗"}${R} ${m.expected}`);
    if (m.actual) console.log(`      ${D}↔ ${m.actual}${R}`);
  }
}

// ---- Step definition ----
interface Step {
  title: string;
  description: string;
  fixture: string;
  pngRects: Rect[];
  expectation: PageExpectation;
  intent: ChangeIntent;
  /** AI prompt for this step (when issues exist) */
  diagnosisContext?: string;
}

// ---- Main ----
async function main() {
  await mkdir(TMP, { recursive: true });

  console.log(`\n${B}${C}╔═══════════════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}${C}║  Multi-Step Goal Demo: Dashboard Rebuild (6 steps)           ║${R}`);
  console.log(`${B}${C}╚═══════════════════════════════════════════════════════════════╝${R}`);

  const llm = createLLMProvider();
  if (llm) console.log(`\n  ${G}✓ AI reasoning enabled${R}`);
  else     console.log(`\n  ${Y}! AI skipped (set ANTHROPIC_API_KEY)${R}`);

  const baseline = await loadTree("baseline.a11y.json");

  const steps: Step[] = [
    {
      title: "Step 1: Replace nav with tabs (WRONG — divs instead of tab roles)",
      description: "Developer replaces navigation with tab-like UI but uses <div> instead of proper ARIA tab roles",
      fixture: "dashboard-step0-tabs-wrong.a11y.json",
      pngRects: [...HDR, ...TITLE, ...TABS_BAD, ...TABLE_BAD],
      expectation: {
        testId: "p",
        expect: "Tab navigation added with proper ARIA roles",
        expectedA11yChanges: [
          { description: "Tablist with tabs added" },
          { description: "Tab panel for content" },
        ],
      },
      intent: { summary: "feat: add dashboard tabs", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
      diagnosisContext: "The developer used <div> elements for tabs instead of role='tablist'/role='tab'. Navigation landmark was also removed. The tabs look correct visually but are not accessible.",
    },
    {
      title: "Step 2: Fix tab roles (tablist + tab + tabpanel)",
      description: "Apply proper ARIA tab pattern",
      fixture: "dashboard-step1-tabs-fixed.a11y.json",
      pngRects: [...HDR, ...TITLE, ...TABS_OK, { x:16,y:82,w:288,h:100,r:250,g:250,b:252 }],
      expectation: {
        testId: "p",
        expect: "Tablist, tab, and tabpanel roles correctly applied",
        expectedA11yChanges: [
          { description: "Tablist landmark added", role: "tablist" },
          { description: "Tabpanel landmark added", role: "tabpanel" },
        ],
      },
      intent: { summary: "fix: apply proper ARIA tab roles", changeType: "bugfix", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    },
    {
      title: "Step 3: Add analytics table (WRONG — no column headers)",
      description: "Add data table but forget <th> column headers",
      fixture: "dashboard-step2-table-no-headers.a11y.json",
      pngRects: [...HDR, ...TITLE, ...TABS_OK, ...TABLE_BAD],
      expectation: {
        testId: "p",
        expect: "Data table with proper column headers",
        expectedA11yChanges: [
          { description: "Table with column headers added" },
        ],
      },
      intent: { summary: "feat: add analytics table", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
      diagnosisContext: "The table was added but has no column headers (no <th> or role='columnheader'). The table also has no accessible name. Screen readers cannot identify what each column represents.",
    },
    {
      title: "Step 4: Fix table headers + add table name",
      description: "Add columnheader roles and table caption",
      fixture: "dashboard-step3-table-fixed.a11y.json",
      pngRects: [...HDR, ...TITLE, ...TABS_OK, ...TABLE_OK],
      expectation: {
        testId: "p",
        expect: "Table has column headers and accessible name",
        expectedA11yChanges: [
          { description: "Column headers added to table" },
          { description: "Table gets accessible name" },
        ],
      },
      intent: { summary: "fix: add table headers and caption", changeType: "bugfix", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    },
    {
      title: "Step 5: Add search filter (WRONG — no labels)",
      description: "Add search but forget labels on searchbox and button",
      fixture: "dashboard-step4-search-no-label.a11y.json",
      pngRects: [...HDR, ...TITLE, ...TABS_OK, ...SEARCH_BAD, ...TABLE_OK],
      expectation: {
        testId: "p",
        expect: "Search filter with accessible labels",
        expectedA11yChanges: [
          { description: "Search landmark with name" },
          { description: "Searchbox with label" },
          { description: "Search button with label" },
        ],
      },
      intent: { summary: "feat: add search filter", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
      diagnosisContext: "Search form was added but the search landmark has no name, the searchbox has no label, and the filter button has no accessible name. This is the third time a feature was added without proper labels.",
    },
    {
      title: "Step 6: Fix all search labels → Dashboard complete",
      description: "Add proper labels to search elements",
      fixture: "dashboard-step5-complete.a11y.json",
      pngRects: [...HDR, ...TITLE, ...TABS_OK, ...SEARCH_OK, ...TABLE_OK],
      expectation: {
        testId: "p",
        expect: "Search with all labels, dashboard fully accessible",
        expectedA11yChanges: [
          { description: "Search landmark gets name" },
          { description: "Searchbox gets label" },
          { description: "Filter button gets label" },
        ],
      },
      intent: { summary: "fix: add search labels", changeType: "bugfix", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    },
  ];

  let prevTree = baseline;
  let passCount = 0;
  let failCount = 0;
  const stepResults: Array<{ title: string; verdict: string; issues: number; pass: boolean }> = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    hr();
    console.log(`\n  ${B}${C}[${i + 1}/${steps.length}]${R} ${B}${step.title}${R}`);
    console.log(`  ${D}${step.description}${R}\n`);

    const tree = await loadTree(step.fixture);
    const imgPath = await savePng(`step${i}.png`, step.pngRects);
    await showFile(imgPath, "Current state:");

    // A11y diff from previous step
    const d = diff(prevTree, tree);
    if (d.changes.length > 0) {
      console.log(`    ${B}Changes:${R} ${d.changes.length}${d.hasRegression ? ` ${BG_R} REGRESSION ${R}` : ""}`);
      printDiff(d);
    }

    // Quality check
    const issueCount = printIssues(tree);

    // Reasoning
    const chain = reasonAboutChanges("p", step.expectation, d.changes.length > 0 ? d : undefined, step.intent);
    console.log();
    printChain(chain);

    const isPass = chain.verdict === "realized" || chain.verdict === "unexpected-side-effects";

    if (!isPass && step.diagnosisContext) {
      // Failure → AI diagnosis
      console.log(`\n    ${BG_Y}${B} NEEDS FIX ${R}\n`);
      await callLLM(llm,
        `A developer is building a dashboard feature. This step failed verification.

Context: ${step.diagnosisContext}

Detected a11y changes:
${d.changes.map(c => `- [${c.type}] ${c.description}`).join("\n")}

A11y quality issues: ${issueCount}
${checkA11yTree(tree).map(i => `- ${i.rule}: ${i.message}`).join("\n")}

Expected but not realized:
${chain.mappings.filter(m => !m.realized).map(m => `- ${m.expected}`).join("\n")}

In 3-4 sentences: explain what went wrong and give the specific fix.`,
        "AI Diagnosis"
      );
      failCount++;
    } else if (isPass) {
      console.log(`\n    ${BG_G}${B} STEP PASS ${R}`);
      passCount++;
    }

    stepResults.push({ title: step.title, verdict: chain.verdict, issues: issueCount, pass: isPass });

    prevTree = tree;
    await sleep(200);
  }

  // Final summary
  hr();
  console.log(`\n  ${B}${C}Dashboard Rebuild Summary${R}\n`);

  for (let i = 0; i < stepResults.length; i++) {
    const sr = stepResults[i];
    const icon = sr.pass ? `${G}✓${R}` : `${RE}✗${R}`;
    const verdictC = sr.verdict === "realized" ? G : sr.verdict === "not-realized" ? RE : Y;
    console.log(`  ${icon} Step ${i+1}: ${verdictC}${sr.verdict}${R} (${sr.issues} issues) ${D}${sr.title.split(":")[0]}${R}`);
  }

  console.log(`\n  ${B}Results:${R} ${G}${passCount} passed${R}, ${failCount > 0 ? `${RE}${failCount} failed (needed fix)${R}` : `${G}0 failed${R}`}`);
  console.log(`  ${D}Pattern: implement → verify → ${failCount > 0 ? "AI diagnose → fix → re-verify → " : ""}complete${R}`);

  // Final spec check
  const finalTree = await loadTree("dashboard-step5-complete.a11y.json");
  const finalIssues = checkA11yTree(finalTree);
  console.log(`\n  ${B}Final a11y:${R} ${finalIssues.length === 0 ? `${BG_G}${B} CLEAN ${R}` : `${RE}${finalIssues.length} issues${R}`}`);

  console.log();

  await rm(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
