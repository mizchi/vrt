#!/usr/bin/env node
/**
 * VRT Fix Loop Demo
 *
 * Demonstrates the loop: detect broken state -> generate fix via reasoning
 * -> apply fix -> re-verify -> PASS.
 *
 * Displays images via kitty graphics protocol.
 *
 * Usage: npx tsx vrt/src/demo-fix-loop.ts
 */
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot, checkA11yTree } from "./a11y-semantic.ts";
import { reasonAboutChanges, type ReasoningChain } from "./reasoning.ts";
import { introspectToSpec, verifySpec } from "./introspect.ts";
import { compareScreenshots } from "./heatmap.ts";
import { encodePng } from "./png-utils.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import { createLLMProvider } from "./llm-client.ts";
import type { A11yNode, PageExpectation, ChangeIntent, VrtSnapshot } from "./types.ts";
import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD, hr as _hr } from "./terminal-colors.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");
const TMP = join(import.meta.dirname!, "..", "test-results", "demo-fix");

const BG_RED = "\x1b[41m";
const BG_GREEN = "\x1b[42m";

function hr() { _hr(64); }
function banner(text: string) {
  console.log(`\n${BOLD}${CYAN}▸ ${text}${RESET}\n`);
}
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// Kitty graphics
function kittyShow(pngBuffer: Buffer, cols = 40) {
  const b64 = pngBuffer.toString("base64");
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

async function showPng(path: string, label: string) {
  console.log(`  ${DIM}${label}:${RESET}`);
  try { kittyShow(await readFile(path)); } catch { console.log("  (no image)"); }
}

// ---- PNG generation ----
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

const HEADER: Rect[] = [
  { x: 0, y: 0, w: 320, h: 32, r: 36, g: 41, b: 46 },
  { x: 8, y: 8, w: 60, h: 16, r: 88, g: 166, b: 255 },
  { x: 80, y: 10, w: 30, h: 12, r: 200, g: 200, b: 210 },
  { x: 118, y: 10, w: 30, h: 12, r: 200, g: 200, b: 210 },
  { x: 156, y: 10, w: 30, h: 12, r: 200, g: 200, b: 210 },
];
const HEADING: Rect[] = [{ x: 40, y: 45, w: 180, h: 20, r: 30, g: 30, b: 30 }];
const FORM_OK: Rect[] = [
  { x: 40, y: 80, w: 240, h: 110, r: 255, g: 255, b: 255 },
  { x: 50, y: 88, w: 80, h: 10, r: 120, g: 120, b: 130 },   // "Email" label
  { x: 50, y: 100, w: 220, h: 20, r: 240, g: 240, b: 245 },  // input
  { x: 50, y: 126, w: 80, h: 10, r: 120, g: 120, b: 130 },   // "Message" label
  { x: 50, y: 138, w: 220, h: 20, r: 240, g: 240, b: 245 },  // input
  { x: 50, y: 165, w: 220, h: 20, r: 35, g: 134, b: 54 },    // button
];
const FORM_BROKEN: Rect[] = [
  { x: 40, y: 80, w: 240, h: 110, r: 255, g: 255, b: 255 },
  // no labels -- bare inputs only
  { x: 50, y: 100, w: 220, h: 20, r: 240, g: 240, b: 245 },
  { x: 50, y: 138, w: 220, h: 20, r: 240, g: 240, b: 245 },
  { x: 50, y: 165, w: 220, h: 20, r: 180, g: 40, b: 40 },    // red button = broken
];
const FORM_FIXED: Rect[] = [
  { x: 40, y: 80, w: 240, h: 110, r: 255, g: 255, b: 255 },
  { x: 50, y: 88, w: 100, h: 10, r: 80, g: 80, b: 90 },      // "Email address" label
  { x: 50, y: 100, w: 220, h: 20, r: 240, g: 240, b: 245 },
  { x: 50, y: 126, w: 100, h: 10, r: 80, g: 80, b: 90 },     // "Your message" label
  { x: 50, y: 138, w: 220, h: 20, r: 240, g: 240, b: 245 },
  { x: 50, y: 165, w: 220, h: 20, r: 35, g: 134, b: 54 },    // green button = OK
];

// ---- Helpers ----

async function loadTree(file: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, file), "utf-8"));
}

function diffTrees(base: A11yNode, snap: A11yNode) {
  return diffA11yTrees(
    parsePlaywrightA11ySnapshot("page", "page", base as any),
    parsePlaywrightA11ySnapshot("page", "page", snap as any),
  );
}

function printA11yIssues(tree: A11yNode) {
  const issues = checkA11yTree(tree);
  if (issues.length === 0) {
    console.log(`  ${GREEN}✓ No a11y issues${RESET}`);
    return;
  }
  for (const i of issues) {
    console.log(`  ${RED}✗${RESET} [${i.severity}] ${i.rule}: ${i.message}`);
    console.log(`    ${DIM}at ${i.path}${RESET}`);
  }
}

function printReasoning(chain: ReasoningChain) {
  const color = chain.verdict === "realized" ? GREEN
    : chain.verdict === "not-realized" ? RED : YELLOW;
  console.log(`  Verdict: ${color}${BOLD}${chain.verdict.toUpperCase()}${RESET}`);
  for (const m of chain.mappings) {
    const icon = m.realized ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${m.expected}`);
    if (m.actual) console.log(`    ${DIM}↔ ${m.actual}${RESET}`);
  }
  if (chain.mappings.length === 0 && chain.actualChanges.length > 0) {
    console.log(`  ${YELLOW}Side effects (unexpected):${RESET}`);
    for (const a of chain.actualChanges.slice(0, 5)) {
      console.log(`    ${RED}!${RESET} [${a.type}] ${a.description}`);
    }
  }
}

function buildDiagnosisPrompt(
  a11yDiff: ReturnType<typeof diffTrees>,
  issues: ReturnType<typeof checkA11yTree>,
  specFailed: Array<{ invariant: { description: string }; reasoning: string }>,
  chain: ReasoningChain,
): string {
  return `You are a UI accessibility expert. A developer ran a refactor and accidentally broke the form labels.

## Detected Issues

### A11y Tree Diff (before → after)
${a11yDiff.changes.map((c) => `- [${c.type}] ${c.description} (severity: ${c.severity})`).join("\n")}

### A11y Quality Issues
${issues.map((i) => `- [${i.severity}] ${i.rule}: ${i.message} (at ${i.path})`).join("\n")}

### Spec Violations
${specFailed.map((f) => `- ${f.invariant.description}: ${f.reasoning}`).join("\n")}

### Reasoning Verdict: ${chain.verdict}
${chain.actualChanges.map((a) => `- [${a.type}] ${a.description}`).join("\n")}

## Task

Based on the above, provide:
1. **Root Cause**: What went wrong?
2. **Impact**: What user-facing problems does this cause?
3. **Fix Plan**: Step-by-step instructions to fix each issue
4. **Verification**: How to confirm the fix worked

Be concise. Focus on actionable fixes.`;
}

function generateFixPlan(chain: ReasoningChain, issues: ReturnType<typeof checkA11yTree>): string[] {
  const plan: string[] = [];

  // Extract fix items from unmatched reasoning
  for (const m of chain.mappings) {
    if (!m.realized) {
      plan.push(`FIX: ${m.expected}`);
    }
  }

  // Extract fix items from a11y issues
  for (const issue of issues) {
    if (issue.rule === "label-missing") {
      plan.push(`ADD LABEL: ${issue.message} (at ${issue.path.split(" > ").pop()})`);
    } else if (issue.rule === "img-alt-missing") {
      plan.push(`ADD ALT: ${issue.message}`);
    }
  }

  // side effects
  for (const a of chain.actualChanges) {
    if (a.type === "node-removed" || a.type === "landmark-changed") {
      if (!chain.mappings.some((m) => m.realized && m.actual?.includes(a.description))) {
        plan.push(`INVESTIGATE: unexpected ${a.type} — ${a.description}`);
      }
    }
  }

  return plan;
}

// ---- Main Demo ----

async function main() {
  await mkdir(TMP, { recursive: true });

  console.log();
  console.log(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  VRT Fix Loop Demo — Detect → Reason → Fix → Verify      ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════╝${RESET}`);

  const baseline = await loadTree("baseline.a11y.json");

  // ============================================================
  // Phase 1: Establish baseline
  // ============================================================
  banner("Phase 1: Baseline");

  const basePng = createPng(320, 200, [...HEADER, ...HEADING, ...FORM_OK]);
  const basePath = join(TMP, "baseline.png");
  await encodePng(basePath, basePng);
  await showPng(basePath, "Baseline (healthy state)");

  console.log(`  ${DIM}A11y check:${RESET}`);
  printA11yIssues(baseline);

  const spec = introspectToSpec({
    generatedAt: "demo",
    pages: [quickIntrospect("page", baseline)],
  });
  console.log(`  ${DIM}Spec generated: ${spec.pages[0].invariants.length} invariants${RESET}`);

  await sleep(500);

  // ============================================================
  // Phase 2: Something breaks (simulated refactor)
  // ============================================================
  banner("Phase 2: Regression Detected");
  console.log(`  ${DIM}A developer runs a refactor and accidentally breaks form labels...${RESET}\n`);

  const broken = await loadTree("snapshot-label-broken.a11y.json");
  const brokenPng = createPng(320, 200, [...HEADER, ...HEADING, ...FORM_BROKEN]);
  const brokenPath = join(TMP, "broken.png");
  await encodePng(brokenPath, brokenPng);

  await showPng(brokenPath, "After refactor (broken)");

  // Visual diff
  const vrtSnap: VrtSnapshot = {
    testId: "page", testTitle: "page", projectName: "demo",
    screenshotPath: brokenPath, baselinePath: basePath, status: "changed",
  };
  const vrtDiff = await compareScreenshots(vrtSnap, { outputDir: TMP });
  if (vrtDiff?.heatmapPath) {
    await showPng(vrtDiff.heatmapPath, `Heatmap (${(vrtDiff.diffRatio * 100).toFixed(1)}% changed)`);
    const sem = classifyVisualDiff(vrtDiff);
    console.log(`  ${DIM}Visual semantic: ${sem.summary}${RESET}`);
  }

  // A11y diff
  const a11yDiff = diffTrees(baseline, broken);
  console.log(`\n  ${BOLD}A11y Diff:${RESET} ${RED}${a11yDiff.changes.length} change(s)${RESET}${a11yDiff.hasRegression ? ` ${BG_RED} REGRESSION ${RESET}` : ""}`);
  for (const c of a11yDiff.changes) {
    const icon = c.severity === "error" ? `${RED}✗${RESET}` : `${YELLOW}~${RESET}`;
    console.log(`  ${icon} [${c.type}] ${c.description}`);
  }

  // A11y quality check
  console.log(`\n  ${BOLD}A11y Quality:${RESET}`);
  const brokenIssues = checkA11yTree(broken);
  printA11yIssues(broken);

  // Spec verification
  const specResult = verifySpec(spec, new Map([["page", { a11yTree: broken, screenshotExists: true }]]));
  const specFailed = specResult.results[0].checked.filter((c) => !c.passed);
  if (specFailed.length > 0) {
    console.log(`\n  ${BOLD}Spec Violations:${RESET} ${RED}${specFailed.length}${RESET}`);
    for (const f of specFailed) {
      console.log(`  ${RED}✗${RESET} ${f.invariant.description}: ${f.reasoning}`);
    }
  }

  // Reasoning
  const intent: ChangeIntent = {
    summary: "refactor: extract utils",
    changeType: "refactor",
    expectedVisualChanges: [],
    expectedA11yChanges: [],
    affectedComponents: [],
  };
  const exp: PageExpectation = { testId: "page", expect: "No changes expected in refactor", a11y: "no-change" };
  const chain = reasonAboutChanges("page", exp, a11yDiff, intent);
  console.log(`\n  ${BOLD}Reasoning:${RESET}`);
  printReasoning(chain);

  await sleep(500);

  // ============================================================
  // Phase 3: Generate fix plan (LLM or heuristic)
  // ============================================================
  banner("Phase 3: AI Diagnosis & Fix Plan");

  const llm = createLLMProvider();

  if (llm) {
    console.log(`  ${DIM}Calling LLM for diagnosis...${RESET}\n`);

    const diagnosisPrompt = buildDiagnosisPrompt(a11yDiff, brokenIssues, specFailed, chain);
    const llmStart = Date.now();
    const diagnosis = await llm.complete(diagnosisPrompt);
    const llmMs = Date.now() - llmStart;

    console.log(`  ${BOLD}AI Diagnosis${RESET} ${DIM}(${llmMs}ms)${RESET}:\n`);
    // Print with indentation
    for (const line of diagnosis.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log();
  } else {
    console.log(`  ${DIM}(ANTHROPIC_API_KEY not set — using heuristic fallback)${RESET}\n`);

    const fixPlan = generateFixPlan(chain, brokenIssues);
    console.log(`  ${BOLD}${fixPlan.length} action item(s):${RESET}\n`);
    for (let i = 0; i < fixPlan.length; i++) {
      console.log(`  ${YELLOW}${i + 1}.${RESET} ${fixPlan[i]}`);
    }
  }

  console.log(`  ${DIM}An agent would now apply these fixes...${RESET}`);
  await sleep(500);

  // ============================================================
  // Phase 4: Apply fix and re-verify
  // ============================================================
  banner("Phase 4: Fix Applied → Re-verify");

  const fixed = await loadTree("snapshot-a11y-fixed.a11y.json");
  const fixedPng = createPng(320, 200, [...HEADER, ...HEADING, ...FORM_FIXED]);
  const fixedPath = join(TMP, "fixed.png");
  await encodePng(fixedPath, fixedPng);

  await showPng(fixedPath, "After fix");

  // Visual diff (fixed vs baseline)
  const fixedVrtSnap: VrtSnapshot = {
    testId: "page", testTitle: "page", projectName: "demo",
    screenshotPath: fixedPath, baselinePath: basePath, status: "changed",
  };
  const fixedVrtDiff = await compareScreenshots(fixedVrtSnap, { outputDir: TMP });
  if (fixedVrtDiff && fixedVrtDiff.diffPixels > 0 && fixedVrtDiff.heatmapPath) {
    await showPng(fixedVrtDiff.heatmapPath, `Heatmap (${(fixedVrtDiff.diffRatio * 100).toFixed(1)}% — label styling diff)`);
  }

  // A11y check on fixed
  console.log(`\n  ${BOLD}A11y Quality (after fix):${RESET}`);
  printA11yIssues(fixed);

  // A11y diff (baseline → fixed = should be improvements only)
  const fixedDiff = diffTrees(baseline, fixed);
  console.log(`\n  ${BOLD}A11y Diff (baseline → fixed):${RESET} ${fixedDiff.changes.length} change(s)`);
  for (const c of fixedDiff.changes) {
    console.log(`  ${GREEN}↑${RESET} [${c.type}] ${c.description}`);
  }

  // Reasoning with correct expectation
  const fixIntent: ChangeIntent = {
    summary: "a11y: fix form labels",
    changeType: "a11y",
    expectedVisualChanges: [],
    expectedA11yChanges: [],
    affectedComponents: ["page"],
  };
  const fixExp: PageExpectation = {
    testId: "page",
    expect: "Form labels added and improved",
    expectedA11yChanges: [
      { description: "Form name improved" },
      { description: "Email textbox label added", role: "textbox" },
      { description: "Message textbox label added", role: "textbox" },
      { description: "Button label improved" },
    ],
  };
  const fixChain = reasonAboutChanges("page", fixExp, fixedDiff, fixIntent);
  console.log(`\n  ${BOLD}Reasoning (fix verification):${RESET}`);
  printReasoning(fixChain);

  // Spec re-verification
  const fixedSpecResult = verifySpec(spec, new Map([["page", { a11yTree: fixed, screenshotExists: true }]]));
  const fixedSpecFailed = fixedSpecResult.results[0].checked.filter((c) => !c.passed);
  console.log(`\n  ${BOLD}Spec Verification:${RESET} ${fixedSpecFailed.length === 0 ? `${BG_GREEN}${BOLD} ALL PASS ${RESET}` : `${RED}${fixedSpecFailed.length} failed${RESET}`}`);

  // LLM fix evaluation
  if (llm) {
    console.log(`\n  ${DIM}Calling LLM for fix evaluation...${RESET}\n`);

    const evalPrompt = `You are verifying a UI fix. The original issue was form labels disappearing during a refactor.

## Fix Applied
The following a11y changes were made (baseline → fixed):
${fixedDiff.changes.map((c) => `- [${c.type}] ${c.description}`).join("\n")}

## Verification Results
- Spec violations: ${fixedSpecFailed.length}
- A11y quality issues: ${checkA11yTree(fixed).length}
- Reasoning verdict: ${fixChain.verdict}
- All expected changes realized: ${fixChain.mappings.every((m) => m.realized)}

## Task
In 2-3 sentences: Is this fix adequate? Are there remaining concerns? Rate the fix quality (1-10).`;

    const evalStart = Date.now();
    const evaluation = await llm.complete(evalPrompt);
    const evalMs = Date.now() - evalStart;

    console.log(`  ${BOLD}AI Fix Evaluation${RESET} ${DIM}(${evalMs}ms)${RESET}:\n`);
    for (const line of evaluation.split("\n")) {
      console.log(`  ${line}`);
    }
  }

  await sleep(300);

  // ============================================================
  // Summary
  // ============================================================
  hr();
  console.log();
  console.log(`  ${BOLD}Fix Loop Summary:${RESET}`);
  console.log();
  console.log(`  ${DIM}Phase 1:${RESET} Baseline established (spec: ${spec.pages[0].invariants.length} invariants)`);
  console.log(`  ${DIM}Phase 2:${RESET} ${RED}Regression detected${RESET} — ${a11yDiff.changes.length} a11y changes, ${brokenIssues.length} quality issues, ${specFailed.length} spec violations`);
  console.log(`  ${DIM}Phase 3:${RESET} ${YELLOW}Fix plan generated${RESET} — ${llm ? "AI diagnosis" : "heuristic"}`);
  console.log(`  ${DIM}Phase 4:${RESET} ${GREEN}Fix verified${RESET} — ${fixChain.verdict}, ${fixedSpecFailed.length} spec violations, 0 a11y issues${llm ? " + AI evaluation" : ""}`);
  console.log();
  console.log(`  ${BOLD}${GREEN}✓ Regression detected → reasoned → fixed → verified${RESET}`);
  console.log();

  await rm(TMP, { recursive: true, force: true });
}

// quickIntrospect (same as goal-runner.ts)
function quickIntrospect(testId: string, tree: A11yNode) {
  const LANDMARK = new Set(["banner", "main", "navigation", "contentinfo", "form", "region", "search"]);
  const INTERACTIVE = new Set(["button", "link", "textbox", "checkbox", "radio", "searchbox", "switch"]);
  const landmarks: { role: string; name: string }[] = [];
  const interactive: { role: string; name: string; hasLabel: boolean }[] = [];
  let totalNodes = 0;

  function walk(node: A11yNode) {
    totalNodes++;
    if (LANDMARK.has(node.role)) landmarks.push({ role: node.role, name: node.name || "" });
    if (INTERACTIVE.has(node.role)) interactive.push({ role: node.role, name: node.name || "", hasLabel: !!node.name });
    for (const c of node.children ?? []) walk(c);
  }
  walk(tree);

  const roleCounts = new Map<string, number>();
  for (const el of interactive) roleCounts.set(el.role, (roleCounts.get(el.role) ?? 0) + 1);

  return {
    testId,
    description: `Page ${testId}`,
    landmarks,
    interactiveElements: interactive,
    stats: { totalNodes, landmarkCount: landmarks.length, interactiveCount: interactive.length, unlabeledCount: interactive.filter((e) => !e.hasLabel).length, headingLevels: [] as number[] },
    suggestedInvariants: [
      ...landmarks.map((l) => ({ description: `${l.role} landmark "${l.name || "(unnamed)"}" is present`, check: "landmark-exists" as const, cost: "low" as const })),
      ...[...roleCounts].map(([role, count]) => ({
        description: `${count} ${role} element(s) expected`,
        check: "element-count" as const,
        cost: "low" as const,
      })),
      { description: "All interactive elements have labels", check: "label-present" as const, cost: "low" as const },
      { description: "No whiteout", check: "no-whiteout" as const, cost: "low" as const },
    ],
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
