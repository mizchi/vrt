/**
 * VRT Verify Pipeline
 *
 * 3-track parallel verification:
 *   Track 1: Intent extraction + dependency graph
 *   Track 2: Visual pixel diff
 *   Track 3: A11y tree diff
 * Then: Cross-validation, quality checks, verdicts, scoring.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { buildDepGraph, findAffectedComponents, graphStats } from "./dep-graph.ts";
import { extractDiffSemantics } from "./intent.ts";
import { compareScreenshots } from "./heatmap.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import { diffA11yTrees, parsePlaywrightA11ySnapshot, checkA11yTree } from "./a11y-semantic.ts";
import { crossValidate, crossValidationToQualityChecks } from "./cross-validation.ts";
import { loadExpectation, crossValidateWithExpectation, scoreLoop } from "./expectation.ts";
import { runQualityChecks } from "./quality.ts";
import { runVerificationLoop } from "./agent.ts";
import type { VrtDiff, A11yDiff, VisualSemanticDiff, UnifiedAgentContext, VrtExpectation, ChangeIntent } from "./types.ts";

export interface VerifyPaths {
  projectRoot: string;
  baselinesDir: string;
  snapshotsDir: string;
  outputDir: string;
  reportPath: string;
  expectationPath: string;
}

export interface VerifyResult {
  context: UnifiedAgentContext;
  vrtDiffs: VrtDiff[];
  a11yDiffs: A11yDiff[];
  passed: boolean;
  needsReview: boolean;
}

export async function runVerifyPipeline(paths: VerifyPaths): Promise<VerifyResult> {
  const { projectRoot, baselinesDir, snapshotsDir, outputDir, reportPath, expectationPath } = paths;

  if (!existsSync(baselinesDir)) {
    throw new Error("No baselines found. Run `vrt init` first.");
  }
  if (!existsSync(snapshotsDir)) {
    throw new Error("No snapshots found. Run `vrt capture` first.");
  }

  await mkdir(outputDir, { recursive: true });

  // ---- Track 1: Intent ----
  console.log("[Track 1] Extracting change intent...");
  let intent: ChangeIntent;
  try {
    const semantics = await extractDiffSemantics(projectRoot);
    intent = semantics.intent;
    console.log(`  Intent: ${intent.summary} (${intent.changeType})`);
  } catch {
    console.log("  (no git diff available, using unknown intent)");
    intent = {
      summary: "unknown change",
      changeType: "unknown" as const,
      expectedVisualChanges: [],
      expectedA11yChanges: [],
      affectedComponents: [],
    };
  }

  // ---- Track 1: Dep graph ----
  console.log("[Track 1] Building dependency graph...");
  let affected;
  try {
    const graph = await buildDepGraph(projectRoot, { languages: ["typescript", "moonbit"] });
    const stats = graphStats(graph);
    console.log(`  ${stats.totalFiles} files, ${stats.components} components`);
    const changed = intent.affectedComponents;
    affected = findAffectedComponents(graph, changed);
    console.log(`  ${affected.length} components affected`);
  } catch {
    console.log("  (dep graph skipped)");
    affected = [];
  }

  // ---- Track 2: Visual diff ----
  console.log("[Track 2] Comparing screenshots...");
  const baselineFiles = await listFiles(baselinesDir, ".png");
  const vrtDiffs: VrtDiff[] = [];

  for (const baseFile of baselineFiles) {
    const name = baseFile.replace(/\.png$/, "");
    const snapFile = join(snapshotsDir, `${name}.png`);
    if (!existsSync(snapFile)) {
      console.log(`  MISSING: ${name} (no snapshot)`);
      continue;
    }

    const snapshot = {
      testId: name,
      testTitle: name,
      projectName: "vrt",
      screenshotPath: snapFile,
      baselinePath: join(baselinesDir, baseFile),
      status: "changed" as const,
    };

    const diff = await compareScreenshots(snapshot, { outputDir });
    if (diff && diff.diffPixels > 0) {
      vrtDiffs.push(diff);
      console.log(
        `  CHANGED: ${name} — ${(diff.diffRatio * 100).toFixed(2)}% (${diff.regions.length} region(s))`
      );
    } else {
      console.log(`  OK: ${name}`);
    }
  }

  // ---- Track 3: A11y diff ----
  console.log("[Track 3] Comparing a11y trees...");
  const a11yDiffs: A11yDiff[] = [];
  const baseA11yFiles = await listFiles(baselinesDir, ".a11y.json");

  for (const baseFile of baseA11yFiles) {
    const name = baseFile.replace(/\.a11y\.json$/, "");
    const snapA11yFile = join(snapshotsDir, `${name}.a11y.json`);
    if (!existsSync(snapA11yFile)) continue;

    try {
      const baseRaw = JSON.parse(await readFile(join(baselinesDir, baseFile), "utf-8"));
      const snapRaw = JSON.parse(await readFile(snapA11yFile, "utf-8"));

      if (!baseRaw || !snapRaw) continue;

      const baseSnap = parsePlaywrightA11ySnapshot(name, name, baseRaw);
      const snapSnap = parsePlaywrightA11ySnapshot(name, name, snapRaw);
      const diff = diffA11yTrees(baseSnap, snapSnap);

      if (diff.changes.length > 0) {
        a11yDiffs.push(diff);
        const emoji = diff.hasRegression ? "NG" : "~~";
        console.log(
          `  [${emoji}] ${name}: +${diff.stats.added}/-${diff.stats.removed}/~${diff.stats.modified}`
        );
      } else {
        console.log(`  OK: ${name}`);
      }

      // A11y quality check on current snapshot
      const issues = checkA11yTree(snapSnap.tree);
      if (issues.length > 0) {
        console.log(`  A11Y ISSUES in ${name}:`);
        for (const issue of issues) {
          console.log(`    [${issue.severity}] ${issue.rule}: ${issue.message}`);
        }
      }
    } catch (err) {
      console.log(`  SKIP: ${name} (parse error)`);
    }
  }

  // ---- Load Expectations (if available) ----
  let expectations: VrtExpectation | undefined;
  if (existsSync(expectationPath)) {
    expectations = await loadExpectation(expectationPath);
    console.log(`\n[Expectations] Loaded: "${expectations.description}"`);
    console.log(`  ${expectations.pages.length} page(s) with expectations`);
    if (expectations.intent) {
      intent = {
        ...intent,
        ...expectations.intent,
        summary: expectations.intent.summary ?? expectations.description,
        expectedA11yChanges: expectations.intent.expectedA11yChanges ?? intent.expectedA11yChanges,
        expectedVisualChanges: expectations.intent.expectedVisualChanges ?? intent.expectedVisualChanges,
        affectedComponents: expectations.intent.affectedComponents ?? intent.affectedComponents,
        changeType: expectations.intent.changeType ?? intent.changeType,
      };
      console.log(`  Intent: ${intent.summary} (${intent.changeType})`);
    }
  }

  // ---- Cross-Validation ----
  console.log("\n[Cross-Validation] Visual x A11y x Intent...");
  const visualSemanticDiffs: VisualSemanticDiff[] = vrtDiffs.map(classifyVisualDiff);

  const allTestIds = new Set([
    ...vrtDiffs.map((d) => d.snapshot.testId),
    ...a11yDiffs.map((d) => d.testId),
    ...(expectations?.pages.map((p) => p.testId) ?? []),
  ]);

  const crossValidations = [...allTestIds].map((testId) => {
    const visDiff = visualSemanticDiffs.find((d) => d.testId === testId);
    const a11yDiff = a11yDiffs.find((d) => d.testId === testId);
    const pageExp = expectations?.pages.find((p) => p.testId === testId);

    if (pageExp) {
      return crossValidateWithExpectation(testId, pageExp, visDiff, a11yDiff, intent);
    }
    return crossValidate(testId, visDiff, a11yDiff, intent);
  });

  for (const cv of crossValidations) {
    const icon = cv.recommendation === "approve" ? "OK"
      : cv.recommendation === "reject" ? "NG" : "??";
    console.log(`  [${icon}] ${cv.testId}: ${cv.reasoning}`);
  }

  // ---- Quality + Verdicts ----
  console.log("\n[Verdict] Final verification...");
  const snapshots = vrtDiffs.map((d) => d.snapshot);

  const approvedTestIds = new Set(
    crossValidations.filter((cv) => cv.recommendation === "approve").map((cv) => cv.testId)
  );
  const filteredCrossValidations = crossValidations.map((cv) => {
    if (approvedTestIds.has(cv.testId) && cv.a11yDiff?.hasRegression) {
      return { ...cv, a11yDiff: { ...cv.a11yDiff, hasRegression: false } };
    }
    return cv;
  });

  const unresolvedSnapshots = snapshots.filter((s) => !approvedTestIds.has(s.testId));
  const unresolvedDiffs = vrtDiffs.filter((d) => !approvedTestIds.has(d.snapshot.testId));
  const qualityChecks = [
    ...(await runQualityChecks(unresolvedSnapshots, unresolvedDiffs)),
    ...crossValidationToQualityChecks(filteredCrossValidations),
  ];

  const unresolved = vrtDiffs.filter((d) => !approvedTestIds.has(d.snapshot.testId));
  const agentResult = await runVerificationLoop(unresolved, intent, qualityChecks);

  const ctx: UnifiedAgentContext = {
    intent,
    vrtDiffs,
    a11yDiffs,
    visualSemanticDiffs,
    crossValidations,
    verdicts: agentResult.verdicts,
    qualityChecks,
  };

  // Save report
  await writeFile(reportPath, JSON.stringify(ctx, null, 2));

  // Score
  const score = scoreLoop(ctx, expectations, {
    fixSteps: 1,
    tokenUsage: 0,
    startTime: 0,
    endTime: Date.now(),
  });

  // Print summary
  const approved = agentResult.verdicts.filter((v) => v.decision === "approve").length;
  const rejected = agentResult.verdicts.filter((v) => v.decision === "reject").length;
  const escalated = agentResult.verdicts.filter((v) => v.decision === "escalate").length;
  const failedQuality = qualityChecks.filter((c) => !c.passed && c.severity === "error").length;

  console.log("\n========================================");
  console.log("  VRT + Semantic Verification Summary");
  console.log("========================================");
  console.log(`  Visual diffs:    ${vrtDiffs.length}`);
  console.log(`  A11y diffs:      ${a11yDiffs.length}`);
  console.log(`  Approved:        ${approved}`);
  console.log(`  Rejected:        ${rejected}`);
  console.log(`  Escalated:       ${escalated}`);
  console.log(`  Quality errors:  ${failedQuality}`);
  console.log("----------------------------------------");
  console.log("  Scores:");
  for (const d of score.details) {
    console.log(`    ${d.category.padEnd(14)} ${d.score}/${d.maxScore}  ${d.reasoning}`);
  }
  console.log("========================================");

  return {
    context: ctx,
    vrtDiffs,
    a11yDiffs,
    passed: rejected === 0 && failedQuality === 0,
    needsReview: escalated > 0,
  };
}

import { readdir } from "node:fs/promises";

async function listFiles(dir: string, suffix: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e.endsWith(suffix));
  } catch {
    return [];
  }
}
