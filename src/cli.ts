import { resolve } from "node:path";
import { analyzeReport, collectScreenshots } from "./playwright-analyzer.ts";
import { buildDepGraph, findAffectedComponents, graphStats } from "./dep-graph.ts";
import { compareScreenshots } from "./heatmap.ts";
import { extractDiffSemantics } from "./intent.ts";
import { runQualityChecks } from "./quality.ts";
import { runVerificationLoop, generateReport } from "./agent.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import { crossValidate, crossValidationToQualityChecks } from "./cross-validation.ts";
import type { VrtDiff, UnifiedAgentContext, A11yDiff, VisualSemanticDiff } from "./types.ts";

interface VerifyOptions {
  projectDir: string;
  reportPath?: string;
  resultsDir?: string;
  baselineDir?: string;
  base?: string;
  head?: string;
  languages?: ("typescript" | "moonbit" | "rust")[];
  outputDir?: string;
  a11yBaselines?: Map<string, Record<string, unknown>>;
  a11ySnapshots?: Map<string, Record<string, unknown>>;
}

/**
 * 統合 VRT + Semantic 検証パイプライン
 *
 * 3つのトラックを並列実行:
 *   Track 1: Git Diff → Dep Graph → Affected → Intent
 *   Track 2: Screenshots → Pixel Diff → Visual Semantic Diff
 *   Track 3: A11y Trees → A11y Semantic Diff
 * → Cross-Validation → Unified Verdicts
 */
export async function verify(opts: VerifyOptions): Promise<UnifiedAgentContext> {
  const {
    projectDir,
    reportPath,
    resultsDir = resolve(projectDir, "test-results"),
    baselineDir = resolve(projectDir, "vrt-baselines"),
    base = "HEAD~1",
    head = "HEAD",
    languages = ["typescript"],
    outputDir = resolve(projectDir, "vrt-output"),
  } = opts;

  console.log("=== VRT + Semantic Verification Pipeline ===\n");

  // ---- Phase 1: Parallel data collection ----
  console.log("[Phase 1] Collecting data (3 tracks in parallel)...\n");

  const [snapshotData, semanticsResult, graphResult] = await Promise.all([
    // Track 2 & 3: Playwright output
    (async () => {
      console.log("  [Track 2/3] Analyzing Playwright output...");
      if (reportPath) {
        const report = await analyzeReport(reportPath);
        console.log(
          `    ${report.snapshots.length} snapshots (${report.stats.passed} passed, ${report.stats.failed} failed)`
        );
        return report.snapshots;
      } else {
        const screenshots = await collectScreenshots(resultsDir, baselineDir);
        console.log(`    ${screenshots.length} screenshots`);
        return screenshots;
      }
    })(),
    // Track 1: Git diff + intent
    (async () => {
      console.log("  [Track 1] Extracting change intent...");
      const s = await extractDiffSemantics(projectDir, base, head);
      console.log(`    Intent: ${s.intent.summary} (${s.intent.changeType})`);
      console.log(`    ${s.filesChanged.length} files changed`);
      return s;
    })(),
    // Track 1 (dep graph)
    (async () => {
      console.log("  [Track 1] Building dependency graph...");
      const g = await buildDepGraph(projectDir, { languages });
      const s = graphStats(g);
      console.log(`    ${s.totalFiles} files, ${s.totalEdges} edges, ${s.components} components`);
      return g;
    })(),
  ]);

  const snapshots = snapshotData;
  const semantics = semanticsResult;
  const graph = graphResult;

  // ---- Phase 2: Parallel diff generation ----
  console.log("\n[Phase 2] Generating diffs (Visual + A11y in parallel)...\n");

  const changedFiles = semantics.filesChanged.map((f) => f.path);
  const affected = findAffectedComponents(graph, changedFiles);
  console.log(`  ${affected.length} components affected`);

  // Track 2: Visual diff + semantic classification
  const [vrtDiffs, a11yDiffs] = await Promise.all([
    (async () => {
      console.log("  [Track 2] Comparing screenshots → Visual Semantic Diff...");
      const diffs: VrtDiff[] = [];
      for (const snapshot of snapshots) {
        if (snapshot.baselinePath) {
          const diff = await compareScreenshots(snapshot, { outputDir });
          if (diff && diff.diffPixels > 0) {
            diffs.push(diff);
          }
        }
      }
      console.log(`    ${diffs.length} visual diffs`);
      return diffs;
    })(),
    // Track 3: A11y diff (when baselines provided)
    (async (): Promise<A11yDiff[]> => {
      console.log("  [Track 3] Computing A11y Semantic Diff...");
      if (!opts.a11yBaselines || !opts.a11ySnapshots) {
        console.log("    (no a11y baselines provided, skipping)");
        return [];
      }
      const { diffA11yTrees, parsePlaywrightA11ySnapshot } = await import("./a11y-semantic.ts");
      const diffs: A11yDiff[] = [];
      for (const [testId, current] of opts.a11ySnapshots) {
        const baseline = opts.a11yBaselines.get(testId);
        if (!baseline) continue;
        const baseSnap = parsePlaywrightA11ySnapshot(testId, testId, baseline);
        const currSnap = parsePlaywrightA11ySnapshot(testId, testId, current);
        const diff = diffA11yTrees(baseSnap, currSnap);
        if (diff.changes.length > 0) diffs.push(diff);
      }
      console.log(`    ${diffs.length} a11y diffs`);
      return diffs;
    })(),
  ]);

  // ---- Phase 3: Semantic classification + Cross-Validation ----
  console.log("\n[Phase 3] Cross-validating Visual ↔ A11y ↔ Intent...\n");

  // Visual Semantic Diff
  const visualSemanticDiffs: VisualSemanticDiff[] = vrtDiffs.map(classifyVisualDiff);
  console.log(
    `  Visual semantics: ${visualSemanticDiffs.map((d) => d.summary).join("; ") || "none"}`
  );

  // Cross-Validation for each test
  const allTestIds = new Set([
    ...visualSemanticDiffs.map((d) => d.testId),
    ...a11yDiffs.map((d) => d.testId),
  ]);

  const crossValidations = [...allTestIds].map((testId) => {
    const visDiff = visualSemanticDiffs.find((d) => d.testId === testId);
    const a11yDiff = a11yDiffs.find((d) => d.testId === testId);
    return crossValidate(testId, visDiff, a11yDiff, semantics.intent);
  });

  for (const cv of crossValidations) {
    const icon =
      cv.recommendation === "approve"
        ? "OK"
        : cv.recommendation === "reject"
          ? "NG"
          : "??";
    console.log(`  [${icon}] ${cv.testId}: ${cv.reasoning}`);
  }

  // ---- Phase 4: Quality checks + Verdicts ----
  console.log("\n[Phase 4] Running quality checks + agent verification...\n");

  const [baseQualityChecks, crossQualityChecks] = await Promise.all([
    runQualityChecks(snapshots, vrtDiffs, graph, affected),
    Promise.resolve(crossValidationToQualityChecks(crossValidations)),
  ]);

  const qualityChecks = [...baseQualityChecks, ...crossQualityChecks];

  const agentResult = await runVerificationLoop(
    vrtDiffs,
    semantics.intent,
    qualityChecks
  );

  const ctx: UnifiedAgentContext = {
    intent: semantics.intent,
    vrtDiffs,
    a11yDiffs,
    visualSemanticDiffs,
    crossValidations,
    verdicts: agentResult.verdicts,
    qualityChecks,
  };

  // Report
  const report = generateUnifiedReport(ctx);
  console.log("\n" + report);

  return ctx;
}

/**
 * 統合レポート生成
 */
function generateUnifiedReport(ctx: UnifiedAgentContext): string {
  const lines: string[] = [];

  lines.push("# VRT + Semantic Verification Report");
  lines.push("");
  lines.push("## Change Intent");
  lines.push(`- Summary: ${ctx.intent.summary}`);
  lines.push(`- Type: ${ctx.intent.changeType}`);
  lines.push("");

  // Cross-Validation summary
  lines.push("## Cross-Validation (Visual x A11y x Intent)");
  const cvApproved = ctx.crossValidations.filter((c) => c.recommendation === "approve");
  const cvRejected = ctx.crossValidations.filter((c) => c.recommendation === "reject");
  const cvEscalated = ctx.crossValidations.filter((c) => c.recommendation === "escalate");
  lines.push(`- Approved: ${cvApproved.length}`);
  lines.push(`- Rejected: ${cvRejected.length}`);
  lines.push(`- Escalated: ${cvEscalated.length}`);
  lines.push("");

  if (cvRejected.length > 0) {
    lines.push("### Rejected (Cross-Validation)");
    for (const cv of cvRejected) {
      lines.push(`- **${cv.testId}** [${cv.consistency}]: ${cv.reasoning}`);
    }
    lines.push("");
  }

  if (cvEscalated.length > 0) {
    lines.push("### Needs Review (Cross-Validation)");
    for (const cv of cvEscalated) {
      lines.push(`- **${cv.testId}** [${cv.consistency}]: ${cv.reasoning}`);
    }
    lines.push("");
  }

  // A11y summary
  if (ctx.a11yDiffs.length > 0) {
    lines.push("## A11y Changes");
    for (const a of ctx.a11yDiffs) {
      lines.push(`### ${a.testId}`);
      lines.push(`- Added: ${a.stats.added}, Removed: ${a.stats.removed}, Modified: ${a.stats.modified}`);
      if (a.hasRegression) lines.push(`- **REGRESSION DETECTED**`);
      for (const c of a.changes.filter((c) => c.severity === "error")) {
        lines.push(`  - [ERROR] ${c.description}`);
      }
      lines.push("");
    }
  }

  // Visual semantic summary
  if (ctx.visualSemanticDiffs.length > 0) {
    lines.push("## Visual Semantic Changes");
    for (const v of ctx.visualSemanticDiffs) {
      lines.push(`- **${v.testId}**: ${v.summary}`);
    }
    lines.push("");
  }

  // Quality checks
  const failedChecks = ctx.qualityChecks.filter((c) => !c.passed);
  if (failedChecks.length > 0) {
    lines.push("## Quality Issues");
    for (const c of failedChecks) {
      lines.push(`- [${c.severity.toUpperCase()}] ${c.check}: ${c.details}`);
    }
    lines.push("");
  }

  // Agent verdicts
  lines.push("## Agent Verdicts");
  const baseReport = generateReport({
    intent: ctx.intent,
    diffs: ctx.vrtDiffs,
    verdicts: ctx.verdicts,
    qualityChecks: ctx.qualityChecks,
  });
  // Append only the summary/verdicts portion
  const summaryStart = baseReport.indexOf("## Summary");
  if (summaryStart >= 0) {
    lines.push(baseReport.slice(summaryStart));
  }

  return lines.join("\n");
}

// ---- CLI Entry Point ----

const args = process.argv.slice(2);
const command = args[0];

if (command === "verify") {
  const projectDir = resolve(args[1] ?? ".");
  const reportPath = args[2];

  verify({
    projectDir,
    reportPath,
  }).catch((err) => {
    console.error("VRT verification failed:", err);
    process.exit(1);
  });
} else if (command === "graph") {
  const projectDir = resolve(args[1] ?? ".");
  const languages = (args[2]?.split(",") ?? ["typescript"]) as (
    | "typescript"
    | "moonbit"
    | "rust"
  )[];

  buildDepGraph(projectDir, { languages }).then((graph) => {
    const stats = graphStats(graph);
    console.log("Dependency Graph Stats:");
    console.log(JSON.stringify(stats, null, 2));
    console.log("\nComponents:");
    for (const node of graph.nodes.values()) {
      if (node.isComponent) {
        console.log(`  ${node.id} (${node.exports.length} exports)`);
      }
    }
  });
} else if (command === "diff-intent") {
  const projectDir = resolve(args[1] ?? ".");
  const base = args[2] ?? "HEAD~1";
  const head = args[3] ?? "HEAD";

  extractDiffSemantics(projectDir, base, head).then((semantics) => {
    console.log("Change Intent:");
    console.log(JSON.stringify(semantics.intent, null, 2));
  });
} else {
  console.log(`Usage:
  tsx src/cli.ts verify [projectDir] [reportPath]  - Run unified VRT + Semantic verification
  tsx src/cli.ts graph [projectDir] [languages]    - Build and display dependency graph
  tsx src/cli.ts diff-intent [projectDir] [base] [head] - Extract change intent from diff
`);
}
