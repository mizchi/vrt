import type {
  AgentContext,
  VrtVerdict,
  VrtDiff,
  ChangeIntent,
  QualityCheckResult,
} from "./types.ts";
import type { LLMProvider } from "./intent.ts";
import { buildReasoningPrompt } from "./intent.ts";

export interface AgentConfig {
  /** Auto-approve diffRatio threshold. Below this = auto-approve */
  autoApproveThreshold: number;
  /** Auto-reject diffRatio threshold. Above this = auto-reject (on quality check failure) */
  autoRejectThreshold: number;
  /** diffRatio range [min, max] for LLM reasoning */
  llmReasoningRange: [number, number];
  /** LLM provider (optional; heuristics-only without it) */
  llm?: LLMProvider;
}

const DEFAULT_CONFIG: AgentConfig = {
  autoApproveThreshold: 0.001, // auto-approve below 0.1%
  autoRejectThreshold: 0.8, // auto-reject above 80%
  llmReasoningRange: [0.001, 0.8],
};

/**
 * VRT verification agent main loop.
 *
 * Graduated filtering:
 * 1. Tiny diffRatio -> auto-approve (rendering noise)
 * 2. Intent-matching change -> auto-approve
 * 3. Quality check failure + large diff -> auto-reject
 * 4. Middle range -> LLM reasoning or escalate
 */
export async function runVerificationLoop(
  diffs: VrtDiff[],
  intent: ChangeIntent,
  qualityChecks: QualityCheckResult[],
  config: Partial<AgentConfig> = {}
): Promise<AgentContext> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const verdicts: VrtVerdict[] = [];

  for (const diff of diffs) {
    const verdict = await evaluateDiff(diff, intent, qualityChecks, cfg);
    verdicts.push(verdict);
  }

  return {
    intent,
    diffs,
    verdicts,
    qualityChecks,
  };
}

async function evaluateDiff(
  diff: VrtDiff,
  intent: ChangeIntent,
  qualityChecks: QualityCheckResult[],
  config: AgentConfig
): Promise<VrtVerdict> {
  const snapshotId = diff.snapshot.testId;

  // Stage 1: Noise filter -- auto-approve tiny diffs
  if (diff.diffRatio <= config.autoApproveThreshold) {
    return {
      snapshotId,
      decision: "approve",
      reasoning: `Diff ratio ${(diff.diffRatio * 100).toFixed(3)}% is below noise threshold (${(config.autoApproveThreshold * 100).toFixed(1)}%)`,
      confidence: 0.95,
    };
  }

  // Stage 2: Intent matching
  const matchedExpectation = matchIntent(diff, intent);
  if (matchedExpectation && matchedExpectation.confidence > 0.7) {
    return {
      snapshotId,
      decision: "approve",
      reasoning: `Diff matches expected change: "${matchedExpectation.description}"`,
      matchedIntent: matchedExpectation,
      confidence: matchedExpectation.confidence,
    };
  }

  // Stage 3: Quality check failure + large diff -> reject
  const failedChecks = qualityChecks.filter(
    (c) => !c.passed && c.severity === "error"
  );
  if (failedChecks.length > 0 && diff.diffRatio > config.autoRejectThreshold) {
    return {
      snapshotId,
      decision: "reject",
      reasoning: `Large diff (${(diff.diffRatio * 100).toFixed(1)}%) with quality check failures: ${failedChecks.map((c) => c.details).join("; ")}`,
      confidence: 0.85,
    };
  }

  // Stage 4: LLM reasoning (if available)
  if (
    config.llm &&
    diff.diffRatio >= config.llmReasoningRange[0] &&
    diff.diffRatio <= config.llmReasoningRange[1]
  ) {
    return await llmReasoning(diff, intent, config.llm);
  }

  // Stage 5: Escalate (human review)
  return {
    snapshotId,
    decision: "escalate",
    reasoning: `Diff ratio ${(diff.diffRatio * 100).toFixed(1)}% with no matching intent. ${matchedExpectation ? `Closest match: "${matchedExpectation.description}" (confidence: ${matchedExpectation.confidence})` : "No intent match found."}`,
    confidence: 0.3,
  };
}

function matchIntent(diff: VrtDiff, intent: ChangeIntent) {
  const testTitle = diff.snapshot.testTitle.toLowerCase();
  const testId = diff.snapshot.testId.toLowerCase();

  // Match component path against test name
  for (const expectation of intent.expectedVisualChanges) {
    const component = expectation.component.toLowerCase();
    const componentName = component
      .replace(/\.[^.]+$/, "")
      .split("/")
      .pop()!;

    if (
      testTitle.includes(componentName) ||
      testId.includes(componentName) ||
      componentName.includes(testTitle)
    ) {
      return expectation;
    }
  }

  // Report visual changes during refactor/deps with low confidence
  if (
    (intent.changeType === "refactor" || intent.changeType === "deps") &&
    diff.diffRatio > 0.01
  ) {
    return {
      component: diff.snapshot.testTitle,
      description: `Unexpected visual change during ${intent.changeType}`,
      confidence: 0.2,
    };
  }

  return null;
}

async function llmReasoning(
  diff: VrtDiff,
  intent: ChangeIntent,
  llm: LLMProvider
): Promise<VrtVerdict> {
  const prompt = buildReasoningPrompt(diff, intent);

  try {
    const response = await llm.complete(prompt);
    const parsed = JSON.parse(response);

    return {
      snapshotId: diff.snapshot.testId,
      decision: parsed.decision ?? "escalate",
      reasoning: parsed.reasoning ?? "LLM returned no reasoning",
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return {
      snapshotId: diff.snapshot.testId,
      decision: "escalate",
      reasoning: "LLM reasoning failed, escalating to human review",
      confidence: 0.1,
    };
  }
}

// ---- Report Generation ----

/**
 * Generate a human-readable report from agent context.
 */
export function generateReport(ctx: AgentContext): string {
  const lines: string[] = [];

  lines.push("# VRT Verification Report");
  lines.push("");
  lines.push(`## Change Intent`);
  lines.push(`- Summary: ${ctx.intent.summary}`);
  lines.push(`- Type: ${ctx.intent.changeType}`);
  lines.push(
    `- Expected visual changes: ${ctx.intent.expectedVisualChanges.length}`
  );
  lines.push("");

  // Summary counts
  const approved = ctx.verdicts.filter((v) => v.decision === "approve");
  const rejected = ctx.verdicts.filter((v) => v.decision === "reject");
  const escalated = ctx.verdicts.filter((v) => v.decision === "escalate");

  lines.push("## Summary");
  lines.push(`- Approved: ${approved.length}`);
  lines.push(`- Rejected: ${rejected.length}`);
  lines.push(`- Escalated: ${escalated.length}`);
  lines.push("");

  // Verdicts detail
  if (rejected.length > 0) {
    lines.push("## Rejected");
    for (const v of rejected) {
      lines.push(`### ${v.snapshotId}`);
      lines.push(`- Reasoning: ${v.reasoning}`);
      lines.push(`- Confidence: ${(v.confidence * 100).toFixed(0)}%`);
      lines.push("");
    }
  }

  if (escalated.length > 0) {
    lines.push("## Needs Review");
    for (const v of escalated) {
      lines.push(`### ${v.snapshotId}`);
      lines.push(`- Reasoning: ${v.reasoning}`);
      lines.push(`- Confidence: ${(v.confidence * 100).toFixed(0)}%`);
      lines.push("");
    }
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

  return lines.join("\n");
}
