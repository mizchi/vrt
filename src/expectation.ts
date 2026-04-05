import { readFile } from "node:fs/promises";
import type {
  VrtExpectation,
  PageExpectation,
  A11yDiff,
  A11yChange,
  ExpectedA11yChange,
  VisualSemanticDiff,
  CrossValidationResult,
  ChangeIntent,
  LoopScore,
  ScoreDetail,
  UnifiedAgentContext,
} from "./types.ts";

/**
 * Load expectation.json.
 */
export async function loadExpectation(path: string): Promise<VrtExpectation> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

/**
 * Check if a11y changes match expectations.
 *
 * For "regression-expected" pages, approve/reject based on whether
 * detected regressions match expectedA11yChanges.
 */
export function matchA11yExpectation(
  pageExp: PageExpectation,
  a11yDiff: A11yDiff | undefined
): { matched: boolean; reasoning: string; matchedChanges: string[]; unmatchedExpected: string[]; unexpectedChanges: string[] } {
  // Infer a11y field from NL expect (when structured fields are omitted)
  const a11yMode = pageExp.a11y ?? inferA11yMode(pageExp.expect);

  // Expecting no-change
  if (a11yMode === "no-change") {
    if (!a11yDiff || a11yDiff.changes.length === 0) {
      return { matched: true, reasoning: "No a11y changes as expected", matchedChanges: [], unmatchedExpected: [], unexpectedChanges: [] };
    }
    return {
      matched: false,
      reasoning: `Expected no a11y changes but got ${a11yDiff.changes.length} change(s)`,
      matchedChanges: [],
      unmatchedExpected: [],
      unexpectedChanges: a11yDiff.changes.map(describe),
    };
  }

  // any = don't care
  if (a11yMode === "any") {
    return { matched: true, reasoning: "A11y changes accepted (any)", matchedChanges: [], unmatchedExpected: [], unexpectedChanges: [] };
  }

  // changed or regression-expected
  if (!a11yDiff || a11yDiff.changes.length === 0) {
    if (a11yMode === "regression-expected") {
      return {
        matched: false,
        reasoning: "Expected a11y regression but no changes detected",
        matchedChanges: [],
        unmatchedExpected: (pageExp.expectedA11yChanges ?? []).map((e) => e.description),
        unexpectedChanges: [],
      };
    }
    return {
      matched: false,
      reasoning: "Expected a11y changes but none detected",
      matchedChanges: [],
      unmatchedExpected: (pageExp.expectedA11yChanges ?? []).map((e) => e.description),
      unexpectedChanges: [],
    };
  }

  // Match expected vs actual (single pass, tracking matched indices)
  const expected = pageExp.expectedA11yChanges ?? [];
  const actual = [...a11yDiff.changes];
  const matchedChanges: string[] = [];
  const matchedActualIdx = new Set<number>();
  const matchedExpIdx = new Set<number>();

  for (let ei = 0; ei < expected.length; ei++) {
    const exp = expected[ei];
    const idx = actual.findIndex((a, i) => !matchedActualIdx.has(i) && matchesSingleA11yChange(exp, a));
    if (idx >= 0) {
      matchedChanges.push(`${exp.description} ↔ ${describe(actual[idx])}`);
      matchedActualIdx.add(idx);
      matchedExpIdx.add(ei);
    }
  }

  const unmatchedExpDescs = expected
    .filter((_, i) => !matchedExpIdx.has(i))
    .map((e) => e.description);

  const unexpectedChanges = actual
    .filter((_, i) => !matchedActualIdx.has(i))
    .map(describe);

  const allExpectedMatched = matchedChanges.length === expected.length;
  const noUnexpected = unexpectedChanges.length === 0;

  // regression-expected: OK if all expected regressions are detected
  if (a11yMode === "regression-expected") {
    if (allExpectedMatched) {
      return {
        matched: true,
        reasoning: `All ${matchedChanges.length} expected a11y regression(s) verified${unexpectedChanges.length > 0 ? ` (+${unexpectedChanges.length} additional change(s))` : ""}`,
        matchedChanges,
        unmatchedExpected: unmatchedExpDescs,
        unexpectedChanges,
      };
    }
    return {
      matched: false,
      reasoning: `Expected ${expected.length} a11y regression(s) but only ${matchedChanges.length} matched`,
      matchedChanges,
      unmatchedExpected: unmatchedExpDescs,
      unexpectedChanges,
    };
  }

  // changed: OK if all changes match expected and no unexpected changes
  return {
    matched: allExpectedMatched && noUnexpected,
    reasoning: allExpectedMatched && noUnexpected
      ? `All ${matchedChanges.length} a11y change(s) match expectations`
      : `${matchedChanges.length}/${expected.length} expected matched, ${unexpectedChanges.length} unexpected`,
    matchedChanges,
    unmatchedExpected: unmatchedExpDescs,
    unexpectedChanges,
  };
}

/**
 * Match expected vs actual a11y changes.
 *
 * Graduated matching:
 * 1. Structured fields (type, role, name, path) for strict matching if present
 * 2. Falls back to description fuzzy matching if no structured fields
 */
function matchesSingleA11yChange(exp: ExpectedA11yChange, actual: A11yChange): boolean {
  const hasStructuredHints = exp.type || exp.path || exp.role || exp.name;

  if (hasStructuredHints) {
    // Structured match: check only specified fields (partial match since optional)
    if (exp.type && exp.type !== actual.type) return false;
    if (exp.path && !actual.path.toLowerCase().includes(exp.path.toLowerCase())) return false;
    if (exp.role) {
      const roleInPath = actual.path.toLowerCase().includes(exp.role.toLowerCase());
      const roleInDesc = actual.description.toLowerCase().includes(exp.role.toLowerCase());
      if (!roleInPath && !roleInDesc) return false;
    }
    if (exp.name) {
      const nameInDesc = actual.description.toLowerCase().includes(exp.name.toLowerCase());
      const nameInPath = actual.path.toLowerCase().includes(exp.name.toLowerCase());
      if (!nameInDesc && !nameInPath) return false;
    }
    return true;
  }

  // Description-only fuzzy match: keyword overlap
  return fuzzyDescriptionMatch(exp.description, actual);
}

/**
 * Fuzzy match via description keywords.
 * Can be replaced with LLM call in the future.
 */
export const STOP_WORDS = new Set([
  "gets", "from", "with", "that", "this", "should",
  "have", "the", "for", "and", "all", "proper",
]);

export const SYNONYMS: Record<string, string[]> = {
  input: ["textbox", "searchbox", "combobox"],
  textbox: ["input", "searchbox"],
  searchbox: ["input", "textbox", "search"],
  label: ["name", "accessible"],
  name: ["label"],
  button: ["btn"],
  nav: ["navigation"],
  navigation: ["nav"],
  search: ["searchbox"],
  tab: ["tablist", "tabpanel"],
  tablist: ["tab", "tabs"],
  tabpanel: ["tab", "panel", "content"],
  panel: ["tabpanel"],
  table: ["grid"],
  column: ["columnheader", "header"],
  header: ["columnheader", "column"],
};

function fuzzyDescriptionMatch(description: string, actual: A11yChange): boolean {
  const rawKeywords = description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  // Expand synonyms for better matching
  const keywords = rawKeywords.flatMap((k) => [k, ...(SYNONYMS[k] ?? [])]);
  if (keywords.length === 0) return false;

  const target = `${actual.type} ${actual.description} ${actual.path}`.toLowerCase();
  const matched = keywords.filter((k) => target.includes(k)).length;
  // Require at least 2 keyword matches AND 40% ratio to avoid false positives
  // from single-word matches in paths (e.g. "form" matching form[Contact])
  return matched >= 2 && matched / keywords.length >= 0.4;
}

/**
 * Infer a11y mode from the NL expect field.
 */
function inferVisualMode(expect?: string): PageExpectation["visual"] {
  if (!expect) return undefined;
  const lower = expect.toLowerCase();
  if (/no\s*visual|visual.*unchanged|look.*same/.test(lower)) return "no-change";
  if (/visual.*chang|look.*differ|appear/.test(lower)) return "changed";
  return undefined; // don't infer → let cross-validation handle it
}

function inferA11yMode(expect?: string): PageExpectation["a11y"] {
  if (!expect) return undefined;
  const lower = expect.toLowerCase();
  if (/no\s*change|unchanged|\bsame\b/.test(lower)) return "no-change";
  if (/regression|\bremov|\bdelet|\bbreak/.test(lower)) return "regression-expected";
  if (/\bchang|\bmodif|\bupdat|\badded?\b/.test(lower)) return "changed";
  return "any";
}

function describe(change: A11yChange): string {
  return `${change.type}: ${change.description}`;
}

/**
 * Expectation-based cross-validation.
 * Alternative to crossValidate. Pages with expectations use this instead.
 */
export function crossValidateWithExpectation(
  testId: string,
  pageExp: PageExpectation | undefined,
  visualDiff: VisualSemanticDiff | undefined,
  a11yDiff: A11yDiff | undefined,
  intent: ChangeIntent
): CrossValidationResult {
  if (!pageExp) {
    // No expectation defined -- fall back to normal cross-validation
    return {
      testId,
      visualDiff,
      a11yDiff,
      intentMatch: false,
      consistency: "mismatch",
      recommendation: "escalate",
      reasoning: "No expectation defined for this page",
    };
  }

  // A11y expectation check
  const a11yResult = matchA11yExpectation(pageExp, a11yDiff);

  // Visual expectation check
  const hasVisual = visualDiff && visualDiff.changes.length > 0;
  const visualMode = pageExp.visual ?? inferVisualMode(pageExp.expect);
  let visualMatched = true;
  let visualReasoning = "";

  if (visualMode === "no-change" && hasVisual) {
    visualMatched = false;
    visualReasoning = `Expected no visual changes but got: ${visualDiff!.summary}`;
  } else if (visualMode === "changed" && !hasVisual) {
    visualMatched = false;
    visualReasoning = "Expected visual changes but none detected";
  } else {
    visualReasoning = hasVisual ? `Visual: ${visualDiff!.summary}` : "Visual: no changes";
  }

  const allMatched = a11yResult.matched && visualMatched;
  const reasoning = [
    a11yResult.reasoning,
    visualReasoning,
    ...(a11yResult.unexpectedChanges.length > 0
      ? [`Unexpected a11y: ${a11yResult.unexpectedChanges.join("; ")}`]
      : []),
  ].join(". ");

  return {
    testId,
    visualDiff,
    a11yDiff,
    intentMatch: allMatched,
    consistency: allMatched ? "consistent" : "mismatch",
    recommendation: allMatched ? "approve" : a11yResult.matched ? "escalate" : "reject",
    reasoning,
  };
}

// ---- Scoring ----

/**
 * Score the overall improvement loop.
 */
export function scoreLoop(
  ctx: UnifiedAgentContext,
  expectations: VrtExpectation | undefined,
  meta: {
    fixSteps: number;
    tokenUsage: number;
    startTime: number;
    endTime: number;
  }
): LoopScore {
  const details: ScoreDetail[] = [];

  // 1. Usability (output clarity)
  const usabilityScore = scoreUsability(ctx, details);

  // 2. Practicality (detection accuracy)
  const practicalityScore = scorePracticality(ctx, expectations, details);

  // 3. Fix steps
  const stepsScore = scoreFixSteps(meta.fixSteps, details);

  // 4. Final quality
  const qualityScore = scoreFinalQuality(ctx, details);

  // 5. Token usage
  const tokenScore = scoreTokenUsage(meta.tokenUsage, details);

  return {
    usability: usabilityScore,
    practicality: practicalityScore,
    fixSteps: meta.fixSteps,
    finalQuality: qualityScore,
    tokenUsage: meta.tokenUsage,
    summary: `Usability: ${usabilityScore}/100, Practicality: ${practicalityScore}/100, Steps: ${meta.fixSteps}, Quality: ${qualityScore}/100, Tokens: ${meta.tokenUsage}`,
    details,
  };
}

function scoreUsability(ctx: UnifiedAgentContext, details: ScoreDetail[]): number {
  let score = 100;

  // Whether all verdicts have clear decisions
  const escalated = ctx.verdicts.filter((v) => v.decision === "escalate");
  if (escalated.length > 0) {
    score -= escalated.length * 10; // escalate means indecisive
  }

  // Whether cross-validation produced meaningful results
  const cvWithReasoning = ctx.crossValidations.filter((cv) => cv.reasoning.length > 20);
  const cvRatio = cvWithReasoning.length / Math.max(ctx.crossValidations.length, 1);
  score = Math.round(score * (0.5 + cvRatio * 0.5));

  details.push({ category: "usability", score, maxScore: 100, reasoning: `${escalated.length} escalated, ${cvRatio.toFixed(0)}% with detailed reasoning` });
  return Math.max(0, Math.min(100, score));
}

function scorePracticality(ctx: UnifiedAgentContext, expectations: VrtExpectation | undefined, details: ScoreDetail[]): number {
  if (!expectations) {
    details.push({ category: "practicality", score: 50, maxScore: 100, reasoning: "No expectations defined — baseline scoring" });
    return 50;
  }

  let matched = 0;
  let total = expectations.pages.length;

  for (const pageExp of expectations.pages) {
    const cv = ctx.crossValidations.find((c) => c.testId === pageExp.testId);
    if (!cv) continue;

    // cross-validation approve -> expectation met
    if (cv.recommendation === "approve") {
      matched++;
    }
  }

  const score = total > 0 ? Math.round((matched / total) * 100) : 50;
  details.push({ category: "practicality", score, maxScore: 100, reasoning: `${matched}/${total} page expectations matched` });
  return score;
}

function scoreFixSteps(steps: number, details: ScoreDetail[]): number {
  // 1 step = 100, 2 = 80, 3 = 60, 5+ = 20
  const score = steps <= 1 ? 100 : steps <= 2 ? 80 : steps <= 3 ? 60 : steps <= 5 ? 40 : 20;
  details.push({ category: "fixSteps", score, maxScore: 100, reasoning: `${steps} step(s) to fix` });
  return score;
}

function scoreFinalQuality(ctx: UnifiedAgentContext, details: ScoreDetail[]): number {
  let score = 100;

  // Unresolved rejects
  const rejected = ctx.verdicts.filter((v) => v.decision === "reject");
  score -= rejected.length * 25;

  // Failed quality checks
  const failedErrors = ctx.qualityChecks.filter((c) => !c.passed && c.severity === "error");
  score -= failedErrors.length * 20;

  const failedWarnings = ctx.qualityChecks.filter((c) => !c.passed && c.severity === "warning");
  score -= failedWarnings.length * 5;

  details.push({
    category: "finalQuality",
    score: Math.max(0, score),
    maxScore: 100,
    reasoning: `${rejected.length} rejected, ${failedErrors.length} errors, ${failedWarnings.length} warnings`,
  });
  return Math.max(0, Math.min(100, score));
}

function scoreTokenUsage(tokens: number, details: ScoreDetail[]): number {
  // < 10k = 100, < 50k = 80, < 100k = 60, < 500k = 40, > 500k = 20
  const score = tokens < 10000 ? 100 : tokens < 50000 ? 80 : tokens < 100000 ? 60 : tokens < 500000 ? 40 : 20;
  details.push({ category: "tokenUsage", score, maxScore: 100, reasoning: `${tokens} tokens used` });
  return score;
}
