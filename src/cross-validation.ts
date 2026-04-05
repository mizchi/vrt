import type {
  CrossValidationResult,
  VisualSemanticDiff,
  A11yDiff,
  ChangeIntent,
  QualityCheckResult,
} from "./types.ts";

/**
 * Cross-validate Visual Semantic Diff with A11y Semantic Diff,
 * match against Intent, and produce a unified verdict.
 *
 * Cross-Validation matrix:
 * | Visual | A11y  | Intent | -> Verdict       |
 * |--------|-------|--------|------------------|
 * | none   | none  | any    | auto-approve     |
 * | yes    | yes   | match  | auto-approve     |
 * | yes    | yes   | none   | escalate         |
 * | yes    | none  | style  | approve          |
 * | yes    | none  | refac  | warning          |
 * | none   | yes   | any    | reject (a11y)    |
 * | any    | regr  | any    | reject           |
 */
export function crossValidate(
  testId: string,
  visualDiff: VisualSemanticDiff | undefined,
  a11yDiff: A11yDiff | undefined,
  intent: ChangeIntent
): CrossValidationResult {
  const hasVisual = visualDiff && visualDiff.changes.length > 0;
  const hasA11y = a11yDiff && a11yDiff.changes.length > 0;
  const hasA11yRegression = a11yDiff?.hasRegression ?? false;

  // A11y regression -> unconditional reject
  if (hasA11yRegression) {
    const regressions = a11yDiff!.changes
      .filter((c) => c.severity === "error")
      .map((c) => c.description);
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: false,
      consistency: "mismatch",
      recommendation: "reject",
      reasoning: `A11y regression detected: ${regressions.join("; ")}`,
    };
  }

  // No changes
  if (!hasVisual && !hasA11y) {
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: true,
      consistency: "consistent",
      recommendation: "approve",
      reasoning: "No visual or accessibility changes detected",
    };
  }

  const intentMatch = matchesComponentIntent(testId, intent);

  // Visual + A11y both changed + intent match -> approve
  if (hasVisual && hasA11y && intentMatch) {
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: true,
      consistency: "consistent",
      recommendation: "approve",
      reasoning: `Both visual and a11y changes match intent: "${intent.summary}"`,
    };
  }

  // Visual + A11y both changed + intent mismatch -> escalate
  if (hasVisual && hasA11y && !intentMatch) {
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: false,
      consistency: "consistent",
      recommendation: "escalate",
      reasoning: `Visual and a11y changes detected but no matching intent. Visual: ${visualDiff!.summary}. A11y: +${a11yDiff!.stats.added}/-${a11yDiff!.stats.removed}/~${a11yDiff!.stats.modified}`,
    };
  }

  // Visual-only change
  if (hasVisual && !hasA11y) {
    if (intent.changeType === "style" || intent.changeType === "a11y") {
      return {
        testId,
        visualDiff,
        a11yDiff,
        intentMatch: true,
        consistency: "visual-only",
        recommendation: "approve",
        reasoning: `Visual-only change consistent with ${intent.changeType} intent. Semantics preserved.`,
      };
    }
    if (intent.changeType === "refactor" || intent.changeType === "deps") {
      return {
        testId,
        visualDiff,
        a11yDiff,
        intentMatch: false,
        consistency: "visual-only",
        recommendation: "escalate",
        reasoning: `Visual change during ${intent.changeType} — semantics preserved but appearance changed unexpectedly. ${visualDiff!.summary}`,
      };
    }
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: intentMatch,
      consistency: "visual-only",
      recommendation: intentMatch ? "approve" : "escalate",
      reasoning: `Visual-only change. A11y semantics unchanged. ${visualDiff!.summary}`,
    };
  }

  // A11y-only change (semantics changed while visual is same)
  if (!hasVisual && hasA11y) {
    // OK if a11y intent
    if (intent.changeType === "a11y" && intentMatch) {
      return {
        testId,
        visualDiff,
        a11yDiff,
        intentMatch: true,
        consistency: "a11y-only",
        recommendation: "approve",
        reasoning: `A11y-only change matches a11y improvement intent. Visual unchanged.`,
      };
    }
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: false,
      consistency: "a11y-only",
      recommendation: "reject",
      reasoning: `A11y semantics changed without visual change — possible semantic regression. Changes: +${a11yDiff!.stats.added}/-${a11yDiff!.stats.removed}/~${a11yDiff!.stats.modified}`,
    };
  }

  // All boolean combinations of hasVisual/hasA11y are covered above.
  // This is unreachable but satisfies the return type.
  throw new Error("Unreachable: all visual/a11y combinations are handled");
}

function matchesComponentIntent(
  testId: string,
  intent: ChangeIntent
): boolean {
  const testLower = testId.toLowerCase();
  return intent.affectedComponents.some((comp) => {
    const compName = comp
      .replace(/\.[^.]+$/, "")
      .split("/")
      .pop()!
      .toLowerCase();
    return testLower.includes(compName) || compName.includes(testLower);
  });
}

/**
 * Generate quality checks from cross-validation results.
 */
export function crossValidationToQualityChecks(
  results: CrossValidationResult[]
): QualityCheckResult[] {
  const checks: QualityCheckResult[] = [];

  // A11y regression
  const regressions = results.filter((r) => r.a11yDiff?.hasRegression);
  if (regressions.length > 0) {
    checks.push({
      check: "a11y-regression",
      passed: false,
      details: `A11y regressions in ${regressions.length} test(s): ${regressions.map((r) => r.testId).join(", ")}`,
      severity: "error",
    });
  } else {
    checks.push({
      check: "a11y-regression",
      passed: true,
      details: "No a11y regressions detected",
      severity: "info",
    });
  }

  // Visual-A11y inconsistency
  const mismatches = results.filter((r) => r.consistency === "a11y-only");
  if (mismatches.length > 0) {
    checks.push({
      check: "a11y-regression",
      passed: false,
      details: `A11y-only changes (possible semantic regression) in: ${mismatches.map((r) => r.testId).join(", ")}`,
      severity: "warning",
    });
  }

  return checks;
}
