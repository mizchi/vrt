import type {
  A11yDiff,
  A11yChange,
  ChangeIntent,
  ExpectedA11yChange,
  PageExpectation,
} from "./types.ts";
import { STOP_WORDS, SYNONYMS } from "./expectation.ts";

/**
 * 期待→変更→実現 の reasoning chain
 *
 * 1. 期待: 何を変えるつもりか (intent + expectation)
 * 2. 変更: 実際に何が変わったか (a11y diff)
 * 3. 実現: 期待が a11y セマンティクスとして実現されたか
 */
export interface ReasoningChain {
  testId: string;
  /** 期待の要約 */
  expectation: string;
  /** 実際の変更 */
  actualChanges: ActualChange[];
  /** 期待と実際の対応付け */
  mappings: ExpectationMapping[];
  /** 結論 */
  verdict: "realized" | "partially-realized" | "not-realized" | "unexpected-side-effects";
  /** 人間可読な reasoning */
  reasoning: string;
}

export interface ActualChange {
  type: string;
  description: string;
  path: string;
  severity: string;
}

export interface ExpectationMapping {
  expected: string;
  actual: string | null;
  realized: boolean;
  reasoning: string;
}

/**
 * 期待した変更が a11y ツリーの差分として実現されたかを reasoning する
 */
export function reasonAboutChanges(
  testId: string,
  pageExp: PageExpectation,
  a11yDiff: A11yDiff | undefined,
  intent: ChangeIntent
): ReasoningChain {
  const expectation = pageExp.expect
    ?? pageExp.expectedA11yChanges?.map((e) => e.description).join("; ")
    ?? intent.summary;

  const actualChanges: ActualChange[] = (a11yDiff?.changes ?? []).map((c) => ({
    type: c.type,
    description: c.description,
    path: c.path,
    severity: c.severity,
  }));

  const expectedChanges = pageExp.expectedA11yChanges ?? [];

  // 期待と実際の対応付け (consumed tracking で重複マッチを防止)
  const mappings: ExpectationMapping[] = [];
  const consumed = new Set<number>();

  for (const exp of expectedChanges) {
    const changes = a11yDiff?.changes ?? [];
    const matchedIdx = findBestMatchIdx(exp, changes, consumed);
    if (matchedIdx >= 0) {
      consumed.add(matchedIdx);
      const matchedActual = changes[matchedIdx];
      mappings.push({
        expected: exp.description,
        actual: `${matchedActual.type}: ${matchedActual.description}`,
        realized: true,
        reasoning: buildMappingReasoning(exp, matchedActual),
      });
    } else {
      mappings.push({
        expected: exp.description,
        actual: null,
        realized: false,
        reasoning: `Expected "${exp.description}" was not detected in the a11y diff`,
      });
    }
  }

  // 期待にない変更 (side effects)
  const sideEffects = actualChanges.filter((_, i) => !consumed.has(i));

  // Verdict
  const allRealized = mappings.length > 0 && mappings.every((m) => m.realized);
  const someRealized = mappings.some((m) => m.realized);
  const hasSideEffects = sideEffects.length > 0;

  let verdict: ReasoningChain["verdict"];
  if (mappings.length === 0 && actualChanges.length === 0) {
    verdict = "not-realized";
  } else if (allRealized && !hasSideEffects) {
    verdict = "realized";
  } else if (allRealized && hasSideEffects) {
    verdict = "unexpected-side-effects";
  } else if (someRealized) {
    verdict = "partially-realized";
  } else {
    verdict = "not-realized";
  }

  // Human-readable reasoning
  const reasoning = buildReasoning(
    testId, expectation, mappings, sideEffects, verdict
  );

  return {
    testId,
    expectation,
    actualChanges,
    mappings,
    verdict,
    reasoning,
  };
}

function findBestMatchIdx(
  exp: ExpectedA11yChange,
  changes: A11yChange[],
  consumed: Set<number>
): number {
  // 構造化フィールドで best-score マッチ (greedy findIndex ではなく最適を選ぶ)
  if (exp.type || exp.role || exp.name) {
    let bestIdx = -1;
    let bestFieldScore = 0;

    for (let i = 0; i < changes.length; i++) {
      if (consumed.has(i)) continue;
      const c = changes[i];
      let fieldScore = 0;
      let fieldCount = 0;

      if (exp.type) {
        fieldCount++;
        if (c.type === exp.type) fieldScore++;
        else continue; // type mismatch is disqualifying
      }
      if (exp.role) {
        fieldCount++;
        const inPath = c.path.toLowerCase().includes(exp.role.toLowerCase());
        const inDesc = c.description.toLowerCase().includes(exp.role.toLowerCase());
        if (inPath || inDesc) fieldScore++;
        else continue;
      }
      if (exp.name) {
        fieldCount++;
        if (c.description.toLowerCase().includes(exp.name.toLowerCase())) fieldScore++;
        else continue;
      }

      if (fieldScore > bestFieldScore) {
        bestFieldScore = fieldScore;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) return bestIdx;
  }

  // description fuzzy マッチ
  // ストップワードを除去し、同義語を展開してから比較
  const rawKeywords = exp.description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  // 同義語を展開
  const keywords = rawKeywords.flatMap((k) => [k, ...(SYNONYMS[k] ?? [])]);

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < changes.length; i++) {
    if (consumed.has(i)) continue;
    const change = changes[i];
    const target = `${change.type} ${change.description} ${change.path}`.toLowerCase();
    const matched = keywords.filter((k) => target.includes(k)).length;
    const score = keywords.length > 0 ? matched / keywords.length : 0;
    // 少なくとも2語一致で候補とする (false positive 防止)
    if (score > bestScore && matched >= 2) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function buildMappingReasoning(exp: ExpectedA11yChange, actual: A11yChange): string {
  const parts: string[] = [];

  parts.push(`Expected: "${exp.description}"`);
  parts.push(`Actual: [${actual.type}] ${actual.description}`);
  parts.push(`Path: ${actual.path}`);

  // セマンティクスの実現を説明
  if (actual.type === "node-added") {
    parts.push("→ New element was added to the a11y tree, matching expectation");
  } else if (actual.type === "node-removed" || actual.type === "landmark-changed") {
    parts.push("→ Element was removed from the a11y tree, matching expectation");
  } else if (actual.type === "name-changed") {
    const before = actual.before?.name ?? "(none)";
    const after = actual.after?.name ?? "(none)";
    parts.push(`→ Accessible name changed: "${before}" → "${after}"`);
  } else if (actual.type === "role-changed") {
    parts.push(`→ Role changed: ${actual.before?.role} → ${actual.after?.role}`);
  } else if (actual.type === "state-changed") {
    parts.push("→ ARIA state changed");
  }

  return parts.join(". ");
}

function buildReasoning(
  testId: string,
  expectation: string,
  mappings: ExpectationMapping[],
  sideEffects: ActualChange[],
  verdict: ReasoningChain["verdict"]
): string {
  const lines: string[] = [];

  lines.push(`[${testId}] Expectation: "${expectation}"`);
  lines.push("");

  if (mappings.length > 0) {
    lines.push("Expectation → Realization mapping:");
    for (const m of mappings) {
      const icon = m.realized ? "✓" : "✗";
      lines.push(`  ${icon} ${m.expected}`);
      if (m.actual) {
        lines.push(`    ↔ ${m.actual}`);
      }
      lines.push(`    ${m.reasoning}`);
    }
    lines.push("");
  }

  if (sideEffects.length > 0) {
    lines.push("Side effects (not in expectations):");
    for (const se of sideEffects) {
      lines.push(`  ! [${se.type}] ${se.description}`);
    }
    lines.push("");
  }

  const verdictText = {
    "realized": "All expected changes were realized in the a11y tree",
    "partially-realized": "Some expected changes were realized, but not all",
    "not-realized": "Expected changes were not detected in the a11y tree",
    "unexpected-side-effects": "All expected changes were realized, but additional unexpected changes were detected",
  };

  lines.push(`Verdict: ${verdict.toUpperCase()} — ${verdictText[verdict]}`);

  return lines.join("\n");
}
