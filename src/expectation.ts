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
 * expectation.json を読み込む
 */
export async function loadExpectation(path: string): Promise<VrtExpectation> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

/**
 * A11y 変更が期待通りかを判定する
 *
 * "regression-expected" なページでは、検出された regression が
 * expectedA11yChanges にマッチするかで approve/reject を決める
 */
export function matchA11yExpectation(
  pageExp: PageExpectation,
  a11yDiff: A11yDiff | undefined
): { matched: boolean; reasoning: string; matchedChanges: string[]; unmatchedExpected: string[]; unexpectedChanges: string[] } {
  // expect (自然言語) から a11y フィールドを推測 (構造化が省略された場合)
  const a11yMode = pageExp.a11y ?? inferA11yMode(pageExp.expect);

  // no-change を期待
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

  // マッチング: expected vs actual (1パスで matched indices を追跡)
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

  // regression-expected: 期待された regression がすべて検出されれば OK
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

  // changed: すべての変更が expected にマッチし、unexpected がなければ OK
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
 * Expected と Actual の A11y 変更を照合する
 *
 * 段階的マッチング:
 * 1. 構造化フィールド (type, role, name, path) があればそれで厳密マッチ
 * 2. 構造化フィールドがなければ description の fuzzy マッチにフォールバック
 *
 * モデル改善で構造化フィールドが不要になっても description だけで動く
 */
function matchesSingleA11yChange(exp: ExpectedA11yChange, actual: A11yChange): boolean {
  const hasStructuredHints = exp.type || exp.path || exp.role || exp.name;

  if (hasStructuredHints) {
    // 構造化マッチ: 指定されたフィールドのみチェック (optional なので部分一致)
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

  // description-only fuzzy マッチ: キーワードの重複度で判定
  return fuzzyDescriptionMatch(exp.description, actual);
}

/**
 * description のキーワードで fuzzy マッチ
 * 将来的にはここを LLM 呼び出しに置き換え可能
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
 * 自然言語の expect フィールドから a11y モードを推測する
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
 * Expectation ベースの cross-validation
 * 通常の crossValidate の代替。expectation が定義されたページはそちらを優先する。
 */
export function crossValidateWithExpectation(
  testId: string,
  pageExp: PageExpectation | undefined,
  visualDiff: VisualSemanticDiff | undefined,
  a11yDiff: A11yDiff | undefined,
  intent: ChangeIntent
): CrossValidationResult {
  if (!pageExp) {
    // expectation 未定義 → 通常の判定にフォールバック
    // (呼び出し元で通常の crossValidate を使う)
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
 * 改善ループ全体のスコアを算出する
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

  // 1. 使いやすさ (出力の明瞭さ)
  const usabilityScore = scoreUsability(ctx, details);

  // 2. 実用性 (検出精度)
  const practicalityScore = scorePracticality(ctx, expectations, details);

  // 3. 修正ステップ
  const stepsScore = scoreFixSteps(meta.fixSteps, details);

  // 4. 最終品質
  const qualityScore = scoreFinalQuality(ctx, details);

  // 5. トークン消費量
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

  // Verdicts がすべて明確な判定を持っているか
  const escalated = ctx.verdicts.filter((v) => v.decision === "escalate");
  if (escalated.length > 0) {
    score -= escalated.length * 10; // escalate は判断できなかったことを意味
  }

  // Cross-validation が意味のある結果を出しているか
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

    // cross-validation が approve → expectation を満たしている
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

  // 未解決の reject
  const rejected = ctx.verdicts.filter((v) => v.decision === "reject");
  score -= rejected.length * 25;

  // 品質チェック失敗
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
