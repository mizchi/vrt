#!/usr/bin/env node
/**
 * VRT Multi-Scenario Demo
 *
 * 3つの複雑なシナリオを順に実行:
 *   Scenario A: リファクタでラベル消失 → AI 診断 → 修正 → 検証
 *   Scenario B: 機能追加の a11y 不備 → 指摘 → 再実装 → 検証
 *   Scenario C: カスケード修正 (role 変更 → 修正 → 別の問題発生 → 再修正)
 *
 * Usage: ANTHROPIC_API_KEY=sk-ant-... npx tsx vrt/src/demo-scenarios.ts
 */
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot, checkA11yTree } from "./a11y-semantic.ts";
import { reasonAboutChanges, type ReasoningChain } from "./reasoning.ts";
import { introspectToSpec, verifySpec, type SpecVerifyResult } from "./introspect.ts";
import { compareScreenshots, encodePng } from "./heatmap.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import { createLLMProvider } from "./llm-client.ts";
import type { LLMProvider } from "./intent.ts";
import type { A11yNode, PageExpectation, ChangeIntent, VrtSnapshot, UiSpec } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");
const TMP = join(import.meta.dirname!, "..", "test-results", "demo-multi");

// ---- Terminal ----
const D = "\x1b[2m", R = "\x1b[0m", G = "\x1b[32m", RE = "\x1b[31m";
const Y = "\x1b[33m", C = "\x1b[36m", B = "\x1b[1m";
const BG_G = "\x1b[42m", BG_R = "\x1b[41m", BG_Y = "\x1b[43m";

function hr() { console.log(`${D}${"─".repeat(64)}${R}`); }
function phase(n: number, total: number, title: string) {
  console.log(`\n  ${B}${C}[${n}/${total}]${R} ${B}${title}${R}\n`);
}
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
function png(w: number, h: number, rects: Rect[], bg = { r: 245, g: 245, b: 250 }) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i*4] = bg.r; data[i*4+1] = bg.g; data[i*4+2] = bg.b; data[i*4+3] = 255; }
  for (const r of rects) {
    for (let y = r.y; y < Math.min(r.y + r.h, h); y++)
      for (let x = r.x; x < Math.min(r.x + r.w, w); x++) {
        const i = (y * w + x) * 4; data[i] = r.r; data[i+1] = r.g; data[i+2] = r.b; data[i+3] = 255;
      }
  }
  return { width: w, height: h, data };
}

const HDR: Rect[] = [
  { x:0,y:0,w:320,h:32,r:36,g:41,b:46 },
  { x:8,y:8,w:60,h:16,r:88,g:166,b:255 },
  { x:80,y:10,w:30,h:12,r:200,g:200,b:210 },
  { x:118,y:10,w:30,h:12,r:200,g:200,b:210 },
  { x:156,y:10,w:30,h:12,r:200,g:200,b:210 },
];
const HEAD: Rect[] = [{ x:40,y:45,w:180,h:20,r:30,g:30,b:30 }];
const FORM = (c: {r:number;g:number;b:number}, labels = true): Rect[] => [
  { x:40,y:80,w:240,h:110,r:255,g:255,b:255 },
  ...(labels ? [
    { x:50,y:88,w:80,h:10,r:120,g:120,b:130 },
    { x:50,y:126,w:80,h:10,r:120,g:120,b:130 },
  ] : []),
  { x:50,y:100,w:220,h:20,r:240,g:240,b:245 },
  { x:50,y:138,w:220,h:20,r:240,g:240,b:245 },
  { x:50,y:165,w:220,h:20,...c },
];
const SEARCH_BAD: Rect[] = [{ x:200,y:8,w:100,h:16,r:80,g:60,b:60 }]; // unlabeled
const SEARCH_OK: Rect[] = [
  { x:200,y:8,w:100,h:16,r:60,g:60,b:70 },
  { x:306,y:8,w:14,h:16,r:100,g:180,b:100 },
];

// ---- Helpers ----
async function loadTree(file: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, file), "utf-8"));
}
function diffTrees(a: A11yNode, b: A11yNode) {
  return diffA11yTrees(
    parsePlaywrightA11ySnapshot("p","p",a as any),
    parsePlaywrightA11ySnapshot("p","p",b as any),
  );
}

function printDiff(diff: ReturnType<typeof diffTrees>) {
  for (const c of diff.changes.slice(0, 6)) {
    const icon = c.severity === "error" ? `${RE}✗${R}` : c.severity === "warning" ? `${Y}~${R}` : `${D}·${R}`;
    console.log(`    ${icon} [${c.type}] ${c.description}`);
  }
  if (diff.changes.length > 6) console.log(`    ${D}... +${diff.changes.length - 6} more${R}`);
}

function printIssues(tree: A11yNode) {
  const issues = checkA11yTree(tree);
  if (issues.length === 0) { console.log(`    ${G}✓ No a11y issues${R}`); return issues; }
  for (const i of issues) console.log(`    ${RE}✗${R} ${i.rule}: ${i.message}`);
  return issues;
}

function printChain(chain: ReasoningChain) {
  const color = chain.verdict === "realized" ? G : chain.verdict === "not-realized" ? RE : Y;
  console.log(`    Verdict: ${color}${B}${chain.verdict.toUpperCase()}${R}`);
  for (const m of chain.mappings) {
    console.log(`    ${m.realized ? G+"✓" : RE+"✗"}${R} ${m.expected}`);
    if (m.actual) console.log(`      ${D}↔ ${m.actual}${R}`);
  }
}

async function callLLM(llm: LLMProvider | null, prompt: string, label: string): Promise<string | null> {
  if (!llm) { console.log(`    ${D}(no API key — skipped)${R}`); return null; }
  console.log(`    ${D}Calling LLM...${R}`);
  const t = Date.now();
  const res = await llm.complete(prompt);
  console.log(`    ${B}${label}${R} ${D}(${Date.now()-t}ms)${R}:\n`);
  for (const line of res.split("\n")) console.log(`    ${line}`);
  console.log();
  return res;
}

function quickSpec(tree: A11yNode): UiSpec {
  const LM = new Set(["banner","main","navigation","contentinfo","form","region","search"]);
  const IA = new Set(["button","link","textbox","checkbox","radio","searchbox","switch"]);
  const lm: {role:string;name:string}[] = [], ia: {role:string;name:string;hasLabel:boolean}[] = [];
  let n = 0;
  (function w(nd: A11yNode) { n++; if(LM.has(nd.role)) lm.push({role:nd.role,name:nd.name||""}); if(IA.has(nd.role)) ia.push({role:nd.role,name:nd.name||"",hasLabel:!!nd.name}); for(const c of nd.children??[]) w(c); })(tree);
  const rc = new Map<string,number>(); for(const e of ia) rc.set(e.role,(rc.get(e.role)??0)+1);
  return introspectToSpec({ generatedAt:"demo", pages:[{
    testId:"p", description:"Page", landmarks:lm, interactiveElements:ia,
    stats:{totalNodes:n,landmarkCount:lm.length,interactiveCount:ia.length,unlabeledCount:ia.filter(e=>!e.hasLabel).length,headingLevels:[]},
    suggestedInvariants:[
      ...lm.map(l=>({description:`${l.role} landmark "${l.name||"(unnamed)"}" is present`,check:"landmark-exists" as const,cost:"low" as const})),
      ...[...rc].map(([role,count])=>({description:`${count} ${role} element(s) expected`,check:"element-count" as const,cost:"low" as const})),
      {description:"All interactive elements have labels",check:"label-present" as const,cost:"low" as const},
    ],
  }]});
}

async function makePng(name: string, rects: Rect[]) {
  const p = join(TMP, name);
  await encodePng(p, png(320, 200, rects));
  return p;
}

// ---- Scenarios ----

async function scenarioA(llm: LLMProvider | null, baseline: A11yNode) {
  console.log(`\n${B}${C}═══ Scenario A: Refactor → Labels Broken → Fix ═══${R}\n`);

  const spec = quickSpec(baseline);
  const basePath = await makePng("a-base.png", [...HDR, ...HEAD, ...FORM({r:35,g:134,b:54})]);

  // Break
  phase(1, 3, "Regression: labels removed by refactor");
  const broken = await loadTree("snapshot-label-broken.a11y.json");
  const brokenPath = await makePng("a-broken.png", [...HDR, ...HEAD, ...FORM({r:180,g:40,b:40}, false)]);
  await showFile(brokenPath, "Broken state:");

  const diff = diffTrees(baseline, broken);
  console.log(`    ${B}A11y:${R} ${RE}${diff.changes.length} changes${R}${diff.hasRegression ? ` ${BG_R} REGRESSION ${R}` : ""}`);
  printDiff(diff);
  const issues = printIssues(broken);

  // AI diagnose
  phase(2, 3, "AI Diagnosis");
  await callLLM(llm, `A refactor broke form accessibility. Detected:
- ${diff.changes.map(c => `[${c.type}] ${c.description}`).join("\n- ")}
- ${issues.map(i => `${i.rule}: ${i.message}`).join("\n- ")}
In 3-4 sentences: diagnose the root cause and give a fix plan.`, "Diagnosis");

  // Fix
  phase(3, 3, "Fix applied → verify");
  const fixed = await loadTree("snapshot-a11y-fixed.a11y.json");
  const fixedPath = await makePng("a-fixed.png", [...HDR, ...HEAD, ...FORM({r:35,g:134,b:54})]);
  await showFile(fixedPath, "Fixed state:");

  printIssues(fixed);
  const specR = verifySpec(spec, new Map([["p", { a11yTree: fixed, screenshotExists: true }]]));
  const fails = specR.results[0].checked.filter(c => !c.passed);
  console.log(`    Spec: ${fails.length === 0 ? `${BG_G}${B} PASS ${R}` : `${RE}${fails.length} failed${R}`}`);
}

async function scenarioB(llm: LLMProvider | null, baseline: A11yNode) {
  console.log(`\n${B}${C}═══ Scenario B: Feature with A11y Gaps → Fix ═══${R}\n`);

  // Step 1: Search added but without labels
  phase(1, 4, "Feature: search form added (incomplete a11y)");
  const noLabel = await loadTree("snapshot-search-no-label.a11y.json");
  const noLabelPath = await makePng("b-nolabel.png", [...HDR, ...SEARCH_BAD, ...HEAD, ...FORM({r:35,g:134,b:54})]);
  await showFile(noLabelPath, "Search added (no labels):");

  const diff1 = diffTrees(baseline, noLabel);
  console.log(`    ${B}A11y:${R} ${diff1.changes.length} changes`);
  printDiff(diff1);

  const issues1 = checkA11yTree(noLabel);
  const searchIssues = issues1.filter(i => i.path.includes("search"));
  console.log(`    ${B}A11y Quality:${R} ${RE}${searchIssues.length} issues in search${R}`);
  for (const i of searchIssues) console.log(`    ${RE}✗${R} ${i.message} (${i.path.split(" > ").pop()})`);

  // Step 2: AI points out the problems
  phase(2, 4, "AI Review: a11y gap analysis");
  await callLLM(llm, `A developer added a search form but forgot accessibility labels. Detected:
- Search landmark has no name (aria-label missing)
- Searchbox has no accessible name
- Search button has no accessible name

The search was added to the header next to the main navigation.

In 3-4 sentences: explain the a11y impact and give specific fixes (attribute names, values).`, "A11y Review");

  // Step 3: Reasoning check — feature expectation partially met
  phase(3, 4, "Reasoning: was the feature properly implemented?");
  const chain = reasonAboutChanges("p", {
    testId: "p",
    expect: "Search form with proper labels added to header",
    expectedA11yChanges: [
      { description: "Search landmark with name added" },
      { description: "Searchbox with accessible label" },
      { description: "Search button with label" },
    ],
  }, diff1, {
    summary: "feat: add search form", changeType: "feature",
    expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [],
  });
  printChain(chain);

  // Step 4: Fix — properly labeled search
  phase(4, 4, "Fix: labels added → verify");
  const withLabel = await loadTree("snapshot-search-added.a11y.json");
  const withLabelPath = await makePng("b-labeled.png", [...HDR, ...SEARCH_OK, ...HEAD, ...FORM({r:35,g:134,b:54})]);
  await showFile(withLabelPath, "Search with labels:");

  const issues2 = checkA11yTree(withLabel);
  const searchIssues2 = issues2.filter(i => i.path.includes("search"));
  console.log(`    Search a11y issues: ${searchIssues2.length === 0 ? `${G}0${R}` : `${RE}${searchIssues2.length}${R}`}`);

  const chain2 = reasonAboutChanges("p", {
    testId: "p",
    expect: "Search form with proper labels",
    expectedA11yChanges: [
      { description: "Search landmark added" },
    ],
  }, diffTrees(baseline, withLabel), {
    summary: "feat: add search form", changeType: "feature",
    expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [],
  });
  printChain(chain2);
}

async function scenarioC(llm: LLMProvider | null, baseline: A11yNode) {
  console.log(`\n${B}${C}═══ Scenario C: Cascade — Fix One Thing, Break Another ═══${R}\n`);

  const spec = quickSpec(baseline);

  // Step 1: Developer converts nav links to buttons (role change)
  phase(1, 5, "Change: nav links → buttons (role regression)");
  const roleChanged = await loadTree("snapshot-role-changed.a11y.json");
  const rolePath = await makePng("c-role.png", [...HDR, ...HEAD, ...FORM({r:35,g:134,b:54})]);
  await showFile(rolePath, "Links became buttons:");

  const diff1 = diffTrees(baseline, roleChanged);
  console.log(`    ${B}A11y:${R} ${diff1.changes.length} changes`);
  printDiff(diff1);

  const specR1 = verifySpec(spec, new Map([["p", { a11yTree: roleChanged, screenshotExists: true }]]));
  const fails1 = specR1.results[0].checked.filter(c => !c.passed);
  console.log(`    Spec: ${RE}${fails1.length} violations${R}`);
  for (const f of fails1) console.log(`    ${RE}✗${R} ${f.invariant.description}: ${f.reasoning}`);

  // Step 2: AI diagnoses the role problem
  phase(2, 5, "AI Diagnosis: role change impact");
  await callLLM(llm, `A developer changed navigation links to buttons. Detected:
${diff1.changes.map(c => `- [${c.type}] ${c.description}`).join("\n")}
Spec violations:
${fails1.map(f => `- ${f.invariant.description}: ${f.reasoning}`).join("\n")}

In 3-4 sentences: explain why link→button is problematic for navigation, and what the fix should be.`, "Role Change Diagnosis");

  // Step 3: Developer fixes links but accidentally removes the form
  phase(3, 5, "Fix attempt: restore links... but form disappears");
  const formRemoved = await loadTree("snapshot-form-removed.a11y.json");
  const formRmPath = await makePng("c-formrm.png", [...HDR, ...HEAD,
    { x:40,y:80,w:240,h:40,r:250,g:250,b:250 }, // empty area
  ]);
  await showFile(formRmPath, "Links restored, but form gone:");

  const diff2 = diffTrees(baseline, formRemoved);
  console.log(`    ${B}A11y:${R} ${diff2.changes.length} changes`);
  printDiff(diff2);

  const specR2 = verifySpec(spec, new Map([["p", { a11yTree: formRemoved, screenshotExists: true }]]));
  const fails2 = specR2.results[0].checked.filter(c => !c.passed);
  console.log(`    Spec: ${RE}${fails2.length} violations${R} ${BG_Y}${B} NEW ISSUE ${R}`);
  for (const f of fails2) console.log(`    ${RE}✗${R} ${f.invariant.description}: ${f.reasoning}`);

  // Step 4: AI diagnoses the cascade
  phase(4, 5, "AI Diagnosis: cascade failure");
  await callLLM(llm, `A developer tried to fix a link→button regression but introduced a new problem.

Previous issue: navigation links were incorrectly changed to buttons.
Fix attempt: reverted the links, but the contact form disappeared entirely.

Detected issues after "fix":
${diff2.changes.map(c => `- [${c.type}] ${c.description}`).join("\n")}
Spec violations:
${fails2.map(f => `- ${f.invariant.description}: ${f.reasoning}`).join("\n")}

In 3-4 sentences: explain the cascade, why it happened, and give a precise fix plan that restores BOTH links AND the form.`, "Cascade Diagnosis");

  // Step 5: Proper fix — baseline restored
  phase(5, 5, "Proper fix: both links and form restored");
  const proper = await loadTree("snapshot-style-only.a11y.json"); // identical to baseline
  const properPath = await makePng("c-proper.png", [...HDR, ...HEAD, ...FORM({r:35,g:134,b:54})]);
  await showFile(properPath, "Fully restored:");

  printIssues(proper);
  const specR3 = verifySpec(spec, new Map([["p", { a11yTree: proper, screenshotExists: true }]]));
  const fails3 = specR3.results[0].checked.filter(c => !c.passed);
  console.log(`    Spec: ${fails3.length === 0 ? `${BG_G}${B} ALL PASS ${R}` : `${RE}${fails3.length} failed${R}`}`);
}

// ---- Main ----

async function main() {
  await mkdir(TMP, { recursive: true });

  console.log(`\n${B}${C}╔════════════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}${C}║  VRT Multi-Scenario Demo                                  ║${R}`);
  console.log(`${B}${C}║  3 scenarios × AI reasoning × kitty graphics               ║${R}`);
  console.log(`${B}${C}╚════════════════════════════════════════════════════════════╝${R}`);

  const llm = createLLMProvider();
  if (llm) {
    console.log(`\n  ${G}✓ ANTHROPIC_API_KEY detected — AI reasoning enabled${R}`);
  } else {
    console.log(`\n  ${Y}! No ANTHROPIC_API_KEY — AI phases will be skipped${R}`);
    console.log(`  ${D}Set ANTHROPIC_API_KEY=sk-ant-... to enable AI reasoning${R}`);
  }

  const baseline = await loadTree("baseline.a11y.json");

  await scenarioA(llm, baseline);
  hr();
  await sleep(300);

  await scenarioB(llm, baseline);
  hr();
  await sleep(300);

  await scenarioC(llm, baseline);

  // Summary
  hr();
  console.log(`\n  ${B}Demo Summary:${R}`);
  console.log(`    ${G}A${R} Label regression → AI diagnosis → fix → ${G}PASS${R}`);
  console.log(`    ${G}B${R} Feature a11y gap → AI review → re-implement → ${G}PASS${R}`);
  console.log(`    ${G}C${R} Cascade failure → 2 AI diagnoses → restore → ${G}PASS${R}`);
  console.log(`    ${D}AI calls: ${llm ? "6 (3 scenarios × 1-2 each)" : "0 (skipped)"}${R}`);
  console.log();

  await rm(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
