#!/usr/bin/env node
/**
 * VRT Fix Loop — CSS 破壊 → VLM 分析 → LLM 修正 → VRT 検証 のループ
 *
 * 実際の HTML を Playwright でレンダリングし、CSS を1プロパティ削除して壊し、
 * 2段階パイプラインで修正して VRT で検証する。
 *
 * Usage:
 *   node --experimental-strip-types src/fix-loop.ts --fixture page --seed 42
 *   node --experimental-strip-types src/fix-loop.ts --fixture dashboard --max-rounds 5
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { compareScreenshots } from "./heatmap.ts";
import {
  parseCssDeclarations, removeCssProperty, extractCss, replaceCss,
  seededRandom, groupBySelector, removeSelectorBlock,
  type CssDeclaration, type CssSelectorBlock,
} from "./css-challenge-core.ts";
import { createReasoningPipeline, type StructuredDiffReport, type FixSuggestion } from "./vrt-reasoning-pipeline.ts";
import { resolveResolutionForViewport } from "./image-resize.ts";
import { getCssChallengeFixturePath } from "./css-challenge-fixtures.ts";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Config ----

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const FIXTURE = getArg("fixture", "page");
const SEED = parseInt(getArg("seed", String(Date.now())), 10);
const MAX_ROUNDS = parseInt(getArg("max-rounds", "3"), 10);
const MODE = getArg("mode", "property") as "property" | "selector";
const VIEWPORT = { width: 1280, height: 900 };
const TMP = join(process.cwd(), "test-results", "fix-loop");

// ---- Terminal ----

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function hr() { console.log(`${DIM}${"─".repeat(72)}${RESET}`); }

// ---- Main ----

async function main() {
  await mkdir(TMP, { recursive: true });

  const fixturePath = getCssChallengeFixturePath(FIXTURE);
  const htmlRaw = await readFile(fixturePath, "utf-8");
  const originalCss = extractCss(htmlRaw);
  if (!originalCss) { console.error("CSS not found"); process.exit(1); }

  const declarations = parseCssDeclarations(originalCss);
  const blocks = groupBySelector(declarations);
  const rand = seededRandom(SEED);

  // Pick what to remove
  let removed: { label: string; brokenCss: string; declarations: CssDeclaration[] };
  if (MODE === "selector") {
    const shuffled = blocks.sort(() => rand() - 0.5);
    const block = shuffled[0];
    removed = {
      label: `${block.selector} { ${block.declarations.length} props }`,
      brokenCss: removeSelectorBlock(originalCss, block),
      declarations: block.declarations,
    };
  } else {
    const shuffled = declarations.sort(() => rand() - 0.5);
    const decl = shuffled[0];
    removed = {
      label: `${decl.selector} { ${decl.property}: ${decl.value} }`,
      brokenCss: removeCssProperty(originalCss, decl),
      declarations: [decl],
    };
  }

  const pipeline = createReasoningPipeline({
    resolution: resolveResolutionForViewport(VIEWPORT.width) as any,
  });

  console.log();
  console.log(`${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  VRT Fix Loop — Detect → Analyze → Fix → Verify                     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log(`  ${DIM}Fixture: ${FIXTURE} | Mode: ${MODE} | Seed: ${SEED} | Max rounds: ${MAX_ROUNDS}${RESET}`);
  console.log(`  ${DIM}Pipeline: VLM=${pipeline?.vlmModel ?? "none"} | LLM=${pipeline?.llmModel ?? "none"}${RESET}`);
  console.log(`  ${RED}Removed: ${removed.label}${RESET}`);
  console.log();

  // ---- Capture baseline ----
  const browser = await chromium.launch();
  const baselinePath = join(TMP, "baseline.png");
  {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.setContent(htmlRaw, { waitUntil: "networkidle" });
    await page.screenshot({ path: baselinePath, fullPage: true });
    await page.close();
  }

  // ---- Fix loop ----
  let currentCss = removed.brokenCss;
  let round = 0;
  let fixed = false;
  const history: Array<{ round: number; diffRatio: number; changes: number; fixes: number; escalated: boolean }> = [];

  for (round = 1; round <= MAX_ROUNDS; round++) {
    console.log(`  ${BOLD}Round ${round}/${MAX_ROUNDS}${RESET}`);

    // Render broken state
    const brokenHtml = replaceCss(htmlRaw, originalCss, currentCss);
    const brokenPath = join(TMP, `broken-r${round}.png`);
    {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.setContent(brokenHtml, { waitUntil: "networkidle" });
      await page.screenshot({ path: brokenPath, fullPage: true });
      await page.close();
    }

    // VRT diff
    const diff = await compareScreenshots({
      testId: `r${round}`, testTitle: `r${round}`, projectName: "fix-loop",
      screenshotPath: brokenPath, baselinePath, status: "changed",
    }, { outputDir: TMP });

    const diffRatio = diff?.diffRatio ?? 0;
    console.log(`    Pixel diff: ${diffRatio === 0 ? GREEN + "0.0%" : (diffRatio * 100).toFixed(1) + "%"}${RESET}`);

    if (diffRatio === 0) {
      console.log(`    ${GREEN}${BOLD}✓ PIXEL-PERFECT — Fix succeeded!${RESET}`);
      fixed = true;
      history.push({ round, diffRatio: 0, changes: 0, fixes: 0, escalated: false });
      break;
    }

    if (diffRatio < 0.005) {
      console.log(`    ${GREEN}✓ Near-perfect (< 0.5%) — Acceptable${RESET}`);
      fixed = true;
      history.push({ round, diffRatio, changes: 0, fixes: 0, escalated: false });
      break;
    }

    // Pipeline: analyze + fix
    if (!pipeline) {
      console.log(`    ${YELLOW}No VLM/LLM available — cannot auto-fix${RESET}`);
      history.push({ round, diffRatio, changes: 0, fixes: 0, escalated: false });
      break;
    }

    const heatmapBase64 = diff?.heatmapPath
      ? (await readFile(diff.heatmapPath)).toString("base64")
      : (await readFile(brokenPath)).toString("base64");

    // Build rich text report: CSS text diff + selector list
    const currentDecls = parseCssDeclarations(currentCss);
    const originalDecls = parseCssDeclarations(originalCss);
    const missingSelectors = [...new Set(originalDecls.map((d) => d.selector))]
      .filter((s) => !currentDecls.some((d) => d.selector === s));
    const cssDiffLines: string[] = [];
    for (const od of originalDecls) {
      const cd = currentDecls.find((d) => d.selector === od.selector && d.property === od.property);
      if (!cd) cssDiffLines.push(`MISSING: ${od.selector} { ${od.property}: ${od.value} }`);
      else if (cd.value !== od.value) cssDiffLines.push(`CHANGED: ${od.selector} { ${od.property}: ${od.value} → ${cd.value} }`);
    }
    const textReport = [
      `Pixel diff: ${(diffRatio * 100).toFixed(1)}%. ${diff?.regions.length ?? 0} diff regions.`,
      missingSelectors.length > 0 ? `Missing CSS selectors: ${missingSelectors.join(", ")}` : "",
      cssDiffLines.length > 0 ? `CSS diff from baseline:\n${cssDiffLines.slice(0, 20).join("\n")}` : "",
    ].filter(Boolean).join("\n");

    const { analysis, fix, escalated } = await pipeline.analyzeAndFix({
      heatmapBase64,
      textReport,
      cssSource: currentCss,
      cssDiff: cssDiffLines.join("\n"),
      highResHeatmapBase64: (await readFile(brokenPath)).toString("base64"),
    });

    console.log(`    VLM: ${analysis.changes.length} changes detected (${analysis.vlmLatencyMs}ms)${escalated ? ` ${YELLOW}[escalated]${RESET}` : ""}`);
    for (const c of analysis.changes.slice(0, 5)) {
      console.log(`      ${DIM}${c.element} { ${c.property}: ${c.before} → ${c.after} }${RESET}`);
    }
    if (analysis.changes.length > 5) console.log(`      ${DIM}... +${analysis.changes.length - 5} more${RESET}`);

    console.log(`    LLM: ${fix.fixes.length} fixes proposed (${fix.llmLatencyMs}ms, confidence: ${fix.confidence})`);

    // Filter fixes: prioritize MISSING selectors, only touch existing selectors if property was in original
    const missingProps = new Set(cssDiffLines.filter((l) => l.startsWith("MISSING:")).map((l) => {
      const m = l.match(/MISSING:\s*(.+?)\s*\{/);
      return m ? m[1].trim() : "";
    }));
    const validFixes = fix.fixes.filter((f) => {
      // Always allow fixes for missing selectors
      if (missingProps.has(f.selector)) return true;
      // For existing selectors, only if the property was in the diff
      return cssDiffLines.some((l) => l.includes(f.selector) && l.includes(f.property));
    });
    if (validFixes.length < fix.fixes.length) {
      console.log(`    ${YELLOW}Filtered: ${fix.fixes.length - validFixes.length} fixes for unknown selectors${RESET}`);
    }

    // Apply fixes to a candidate CSS
    let candidateCss = currentCss;
    let applied = 0;
    for (const f of validFixes) {
      const lines = candidateCss.split("\n");
      let patched = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const match = trimmed.match(/^([^{]+)\{([^}]+)\}\s*$/);
        if (match && match[1].trim() === f.selector) {
          const body = match[2];
          const propRegex = new RegExp(`${escapeRegex(f.property)}\\s*:[^;]+;?`);
          if (propRegex.test(body)) {
            const newBody = body.replace(propRegex, `${f.property}: ${f.value};`);
            lines[i] = `${f.selector} { ${newBody.trim()} }`;
          } else {
            const newBody = `${body.trim()} ${f.property}: ${f.value};`;
            lines[i] = `${f.selector} { ${newBody} }`;
          }
          patched = true;
          applied++;
          break;
        }
      }
      if (!patched) {
        candidateCss += `\n${f.selector} { ${f.property}: ${f.value}; }`;
        applied++;
      } else {
        candidateCss = lines.join("\n");
      }
    }

    // Dry run: verify fix doesn't make things worse
    const candidateHtml = replaceCss(htmlRaw, originalCss, candidateCss);
    const candidatePath = join(TMP, `candidate-r${round}.png`);
    {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await page.setContent(candidateHtml, { waitUntil: "networkidle" });
      await page.screenshot({ path: candidatePath, fullPage: true });
      await page.close();
    }
    const candidateDiff = await compareScreenshots({
      testId: `candidate-r${round}`, testTitle: `candidate-r${round}`, projectName: "fix-loop",
      screenshotPath: candidatePath, baselinePath, status: "changed",
    }, { outputDir: TMP, skipHeatmap: true });
    const candidateDiffRatio = candidateDiff?.diffRatio ?? 1;

    if (candidateDiffRatio < diffRatio) {
      // Fix improved things — accept
      console.log(`    Applied: ${applied}/${validFixes.length} fixes → diff ${(diffRatio * 100).toFixed(1)}% → ${(candidateDiffRatio * 100).toFixed(1)}% ${GREEN}✓${RESET}`);
      currentCss = candidateCss;
      if (candidateDiffRatio === 0) {
        console.log(`    ${GREEN}${BOLD}✓ PIXEL-PERFECT — Fix succeeded!${RESET}`);
        fixed = true;
        history.push({ round, diffRatio: 0, changes: analysis.changes.length, fixes: applied, escalated });
        break;
      }
      if (candidateDiffRatio < 0.005) {
        console.log(`    ${GREEN}✓ Near-perfect (< 0.5%)${RESET}`);
        fixed = true;
        history.push({ round, diffRatio: candidateDiffRatio, changes: analysis.changes.length, fixes: applied, escalated });
        break;
      }
    } else {
      // Fix made things worse or no change — rollback
      console.log(`    Applied: ${applied}/${validFixes.length} fixes → diff ${(diffRatio * 100).toFixed(1)}% → ${(candidateDiffRatio * 100).toFixed(1)}% ${RED}✗ rollback${RESET}`);
    }

    history.push({ round, diffRatio: Math.min(diffRatio, candidateDiffRatio), changes: analysis.changes.length, fixes: applied, escalated });
  }

  await browser.close();

  // ---- Summary ----
  hr();
  console.log();
  console.log(`  ${BOLD}Fix Loop Summary${RESET}`);
  console.log();
  console.log(`  ${DIM}Fixture:${RESET}  ${FIXTURE}`);
  console.log(`  ${DIM}Removed:${RESET}  ${removed.label}`);
  console.log(`  ${DIM}Result:${RESET}   ${fixed ? GREEN + BOLD + "FIXED" : RED + BOLD + "NOT FIXED"}${RESET} (${round} round${round > 1 ? "s" : ""})`);
  console.log();

  if (history.length > 0) {
    console.log(`  ${"Round".padEnd(8)} ${"Diff".padStart(8)} ${"Changes".padStart(10)} ${"Fixes".padStart(8)} ${"Escalated".padStart(10)}`);
    for (const h of history) {
      const diffStr = h.diffRatio === 0 ? `${GREEN}0.0%${RESET}` : `${(h.diffRatio * 100).toFixed(1)}%`;
      console.log(`  ${String(h.round).padEnd(8)} ${diffStr.padStart(8)} ${String(h.changes).padStart(10)} ${String(h.fixes).padStart(8)} ${String(h.escalated).padStart(10)}`);
    }
  }

  const totalCost = history.reduce((s, h) => s, 0); // costs tracked in pipeline
  console.log();

  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  process.exit(fixed ? 0 : 1);
}

// CLI guard
if (process.argv[1]?.endsWith("fix-loop.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
