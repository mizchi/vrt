import type {
  A11yDiff,
  ChangeIntent,
  PageExpectation,
  LoopScore,
  UnifiedAgentContext,
  VrtExpectation,
} from "./types.ts";
import { diffA11yTrees, parsePlaywrightA11ySnapshot } from "./a11y-semantic.ts";
import { matchA11yExpectation, crossValidateWithExpectation, scoreLoop } from "./expectation.ts";
import { reasonAboutChanges, type ReasoningChain } from "./reasoning.ts";
import { introspectToSpec, verifySpec, type SpecVerifyResult } from "./introspect.ts";
import type { A11yNode } from "./types.ts";

// ---- Goal & Step definitions ----

export interface Goal {
  description: string;
  steps: GoalStep[];
  /** ゴール達成の判定条件 (自然言語) */
  successCriteria: string;
  /** ゴール達成を判定する不変条件 */
  finalInvariants?: PageExpectation[];
}

export interface GoalStep {
  description: string;
  /** この step の expectation */
  expectation: PageExpectation;
  /** この step で使う snapshot ファイル名 (fixture テスト用) */
  snapshotFile?: string;
}

// ---- Runner State ----

export interface GoalRunnerState {
  goal: Goal;
  currentStep: number;
  stepResults: StepResult[];
  status: "running" | "completed" | "failed";
  finalScore?: GoalScore;
}

export interface StepResult {
  stepIndex: number;
  description: string;
  reasoning: ReasoningChain;
  specResult?: SpecVerifyResult;
  passed: boolean;
  retries: number;
}

export interface GoalScore {
  stepSuccessRate: number;     // 0-1
  totalRetries: number;
  averageStepScore: number;   // 0-100
  goalRealized: boolean;
  summary: string;
}

// ---- Runner ----

export interface RunStepFn {
  (step: GoalStep, prevSnapshot: A11yNode): Promise<A11yNode>;
}

/**
 * Goal Runner: マルチステップのゴールを逐次実行・検証する
 *
 * fixture テスト用: loadSnapshot で各 step の snapshot を提供
 * 実際のエージェント用: runStep でコード変更 → capture → snapshot 取得
 */
export async function runGoal(
  goal: Goal,
  baseline: A11yNode,
  loadSnapshot: (step: GoalStep, retryCount: number) => Promise<A11yNode>,
  opts: { maxRetries?: number } = {}
): Promise<GoalRunnerState> {
  const maxRetries = opts.maxRetries ?? 3;
  const state: GoalRunnerState = {
    goal,
    currentStep: 0,
    stepResults: [],
    status: "running",
  };

  if (goal.steps.length === 0) {
    state.status = "completed";
    state.finalScore = computeGoalScore(state);
    return state;
  }

  let currentBaseline = baseline;

  for (let i = 0; i < goal.steps.length; i++) {
    state.currentStep = i;
    const step = goal.steps[i];
    let passed = false;
    let retries = 0;
    let lastSnapshot!: A11yNode;
    let reasoning!: ReasoningChain;
    let specResult: SpecVerifyResult | undefined;

    while (!passed && retries <= maxRetries) {
      lastSnapshot = await loadSnapshot(step, retries);

      // a11y diff
      const baseSnap = parsePlaywrightA11ySnapshot("page", "page", currentBaseline as any);
      const snapSnap = parsePlaywrightA11ySnapshot("page", "page", lastSnapshot as any);
      const diff = diffA11yTrees(baseSnap, snapSnap);

      // reasoning
      const intent: ChangeIntent = {
        summary: step.description,
        changeType: "feature",
        expectedVisualChanges: [],
        expectedA11yChanges: [],
        affectedComponents: [],
      };

      reasoning = reasonAboutChanges("page", step.expectation, diff.changes.length > 0 ? diff : undefined, intent);

      // spec verify (long-cycle check against baseline invariants)
      const introspection = quickIntrospect(lastSnapshot);
      const spec = introspectToSpec({ generatedAt: "goal-run", pages: [introspection] });
      const pageData = new Map([["page", { a11yTree: lastSnapshot, screenshotExists: true }]]);
      specResult = verifySpec(spec, pageData);

      // 判定: reasoning が realized or unexpected-side-effects なら OK
      passed = reasoning.verdict === "realized" || reasoning.verdict === "unexpected-side-effects";

      if (!passed) {
        retries++;
      }
    }

    state.stepResults.push({
      stepIndex: i,
      description: step.description,
      reasoning,
      specResult,
      passed,
      retries,
    });

    if (!passed) {
      state.status = "failed";
      break;
    }

    // 次の step のベースラインはキャッシュ済み snapshot (double-call 回避)
    currentBaseline = lastSnapshot;
  }

  if (state.status === "running") {
    // 全 step 通過 → ゴール判定
    if (goal.finalInvariants) {
      const lastStep = goal.steps[goal.steps.length - 1];
      const finalSnapshot = await loadSnapshot(lastStep, 0);
      const baseSnap = parsePlaywrightA11ySnapshot("page", "page", baseline as any);
      const snapSnap = parsePlaywrightA11ySnapshot("page", "page", finalSnapshot as any);
      const finalDiff = diffA11yTrees(baseSnap, snapSnap);

      let allFinalPassed = true;
      for (const inv of goal.finalInvariants) {
        const result = matchA11yExpectation(inv, finalDiff.changes.length > 0 ? finalDiff : undefined);
        if (!result.matched) allFinalPassed = false;
      }

      state.status = allFinalPassed ? "completed" : "failed";
    } else {
      state.status = "completed";
    }
  }

  // Score
  state.finalScore = computeGoalScore(state);

  return state;
}

function computeGoalScore(state: GoalRunnerState): GoalScore {
  const passed = state.stepResults.filter((r) => r.passed).length;
  const total = state.goal.steps.length;
  const totalRetries = state.stepResults.reduce((sum, r) => sum + r.retries, 0);
  const stepSuccessRate = total > 0 ? passed / total : 0;
  const goalRealized = state.status === "completed";

  // Step ごとのスコア: passed = 100, retried = 60, failed = 0
  const stepScores = state.stepResults.map((r) =>
    r.passed ? (r.retries === 0 ? 100 : Math.max(40, 100 - r.retries * 20)) : 0
  );
  const averageStepScore = stepScores.length > 0
    ? stepScores.reduce((a, b) => a + b, 0) / stepScores.length
    : 0;

  return {
    stepSuccessRate,
    totalRetries,
    averageStepScore: Math.round(averageStepScore),
    goalRealized,
    summary: `${passed}/${total} steps passed (${totalRetries} retries). Goal: ${goalRealized ? "ACHIEVED" : "NOT ACHIEVED"}. Avg step score: ${Math.round(averageStepScore)}/100`,
  };
}

/**
 * 簡易 introspect (テスト用。full introspect は fs 依存)
 */
function quickIntrospect(tree: A11yNode) {
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

  return {
    testId: "page",
    description: "Page",
    landmarks,
    interactiveElements: interactive,
    stats: { totalNodes, landmarkCount: landmarks.length, interactiveCount: interactive.length, unlabeledCount: interactive.filter((e) => !e.hasLabel).length, headingLevels: [] as number[] },
    suggestedInvariants: [
      ...landmarks.map((l) => ({ description: `${l.role} landmark "${l.name || "(unnamed)"}" is present`, check: "landmark-exists" as const, cost: "low" as const })),
      { description: "All interactive elements have labels", check: "label-present" as const, cost: "low" as const },
    ],
  };
}

/**
 * GoalRunnerState から人間可読なレポートを生成する
 */
export function formatGoalReport(state: GoalRunnerState): string {
  const lines: string[] = [];
  lines.push(`# Goal: ${state.goal.description}`);
  lines.push(`Status: ${state.status.toUpperCase()}`);
  lines.push("");

  for (const result of state.stepResults) {
    const icon = result.passed ? "OK" : "NG";
    const retry = result.retries > 0 ? ` (${result.retries} retries)` : "";
    lines.push(`## Step ${result.stepIndex + 1}: ${result.description}`);
    lines.push(`[${icon}]${retry} — ${result.reasoning.verdict}`);

    for (const m of result.reasoning.mappings) {
      const mark = m.realized ? "+" : "-";
      lines.push(`  ${mark} ${m.expected}`);
      if (m.actual) lines.push(`    ↔ ${m.actual}`);
    }
    lines.push("");
  }

  if (state.finalScore) {
    lines.push("## Score");
    lines.push(state.finalScore.summary);
  }

  return lines.join("\n");
}
