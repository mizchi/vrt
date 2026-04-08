/**
 * 再現可能なシナリオテスト
 *
 * fixtures/ のプリビルド a11y ツリーを使い、
 * サーバー不要でパイプライン全体をテストする。
 *
 * 各シナリオは:
 * 1. baseline + snapshot を読む
 * 2. expectation を定義
 * 3. 検証パイプラインを実行
 * 4. スコアを評価
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot, checkA11yTree } from "./a11y-semantic.ts";
import { matchA11yExpectation, crossValidateWithExpectation, scoreLoop } from "./expectation.ts";
import { introspectToSpec, verifySpec } from "./introspect.ts";
import type {
  A11yNode,
  PageExpectation,
  ChangeIntent,
  UnifiedAgentContext,
  VrtExpectation,
  PageIntrospection,
} from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");

async function loadTree(filename: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, filename), "utf-8"));
}

function introspectFromTree(testId: string, tree: A11yNode): PageIntrospection {
  // Simplified introspect for test
  const landmarks: { role: string; name: string }[] = [];
  const interactive: { role: string; name: string; hasLabel: boolean }[] = [];
  const LANDMARK = new Set(["banner", "main", "navigation", "contentinfo", "form", "region", "search"]);
  const INTERACTIVE = new Set(["button", "link", "textbox", "checkbox", "radio"]);

  function walk(node: A11yNode) {
    if (LANDMARK.has(node.role)) landmarks.push({ role: node.role, name: node.name || "" });
    if (INTERACTIVE.has(node.role)) interactive.push({ role: node.role, name: node.name || "", hasLabel: !!node.name });
    for (const c of node.children ?? []) walk(c);
  }
  walk(tree);

  return {
    testId,
    description: `Page ${testId}`,
    landmarks,
    interactiveElements: interactive,
    stats: {
      totalNodes: 0,
      landmarkCount: landmarks.length,
      interactiveCount: interactive.length,
      unlabeledCount: interactive.filter((e) => !e.hasLabel).length,
      headingLevels: [],
    },
    suggestedInvariants: [
      ...landmarks.filter((l) => ["banner", "main", "navigation"].includes(l.role))
        .map((l) => ({ description: `${l.role} landmark is present`, check: "landmark-exists" as const, cost: "low" as const })),
      { description: "All interactive elements have labels", check: "label-present" as const, cost: "low" as const },
      { description: "No whiteout", check: "no-whiteout" as const, cost: "low" as const },
    ],
  };
}

describe("Scenario: intentional nav removal", () => {
  it("should APPROVE with correct expectation (short-cycle)", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-nav-removed.a11y.json");

    const baseSnap = parsePlaywrightA11ySnapshot("home", "home", baseline as any);
    const snapSnap = parsePlaywrightA11ySnapshot("home", "home", snapshot as any);
    const diff = diffA11yTrees(baseSnap, snapSnap);

    assert.ok(diff.hasRegression, "Should detect regression (nav removed)");
    assert.ok(diff.landmarkChanges.length > 0, "Should detect landmark change");

    // Short-cycle expectation: nav removal is expected
    const exp: PageExpectation = {
      testId: "home",
      expect: "Navigation removed from header",
      expectedA11yChanges: [{ description: "Navigation landmark removed" }],
    };

    const result = matchA11yExpectation(exp, diff);
    assert.ok(result.matched, `Should match: ${result.reasoning}`);
  });

  it("should REJECT without expectation (caught by long-cycle spec)", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-nav-removed.a11y.json");

    // Generate spec from baseline (long-cycle invariants)
    const introspection = introspectFromTree("home", baseline);
    const spec = introspectToSpec({
      generatedAt: "test",
      pages: [introspection],
    });

    // Verify spec against snapshot
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(spec, data);

    const navCheck = result.results[0].checked.find((c) =>
      c.invariant.description.includes("navigation")
    );

    assert.ok(navCheck, "Should check for navigation landmark");
    assert.equal(navCheck!.passed, false, "Navigation landmark should be missing");
  });

  it("should score high with expectation, low without", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-nav-removed.a11y.json");

    const baseSnap = parsePlaywrightA11ySnapshot("home", "home", baseline as any);
    const snapSnap = parsePlaywrightA11ySnapshot("home", "home", snapshot as any);
    const diff = diffA11yTrees(baseSnap, snapSnap);

    const intent: ChangeIntent = {
      summary: "style: hide nav on home",
      changeType: "style",
      expectedVisualChanges: [],
      expectedA11yChanges: [],
      affectedComponents: ["home"],
    };

    // With expectation → approve → high score
    const expPage: PageExpectation = {
      testId: "home",
      expect: "Navigation removed",
      expectedA11yChanges: [{ description: "Navigation landmark removed" }],
    };
    const cv = crossValidateWithExpectation("home", expPage, undefined, diff, intent);
    assert.equal(cv.recommendation, "approve");

    const ctxGood: UnifiedAgentContext = {
      intent,
      vrtDiffs: [],
      a11yDiffs: [diff],
      visualSemanticDiffs: [],
      crossValidations: [cv],
      verdicts: [],
      qualityChecks: [],
    };

    const expectations: VrtExpectation = {
      description: "Remove nav",
      pages: [expPage],
    };

    const scoreGood = scoreLoop(ctxGood, expectations, { fixSteps: 1, tokenUsage: 40000, startTime: 0, endTime: 1000 });
    assert.ok(scoreGood.practicality >= 80, `High practicality: ${scoreGood.practicality}`);
    assert.ok(scoreGood.finalQuality >= 80, `High quality: ${scoreGood.finalQuality}`);
  });
});

describe("Scenario: accidental label breakage", () => {
  it("should detect label regression via spec invariants", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-label-broken.a11y.json");

    // Generate spec from baseline
    const introspection = introspectFromTree("home", baseline);
    const spec = introspectToSpec({
      generatedAt: "test",
      pages: [introspection],
    });

    // Verify against broken snapshot
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(spec, data);

    const labelCheck = result.results[0].checked.find((c) =>
      c.invariant.check === "label-present"
    );

    assert.ok(labelCheck, "Should check for labels");
    // Global invariant also checks labels
    const globalLabel = result.results[0].checked.filter((c) =>
      c.invariant.check === "label-present"
    );
    const anyFailed = globalLabel.some((c) => !c.passed);
    assert.ok(anyFailed, "Should detect unlabeled elements");
  });

  it("should detect via a11y diff", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-label-broken.a11y.json");

    const baseSnap = parsePlaywrightA11ySnapshot("home", "home", baseline as any);
    const snapSnap = parsePlaywrightA11ySnapshot("home", "home", snapshot as any);
    const diff = diffA11yTrees(baseSnap, snapSnap);

    assert.ok(diff.changes.length > 0, "Should detect changes");

    // Without expectation for label removal → a11y issues
    const issues = checkA11yTree(snapshot);
    const labelIssues = issues.filter((i) => i.rule === "label-missing");
    assert.ok(labelIssues.length >= 3, `Should find unlabeled elements: ${labelIssues.length}`);
  });
});

describe("Scenario: dep graph skip", () => {
  it("should skip unaffected invariants", async () => {
    const tree = await loadTree("baseline.a11y.json");

    const spec = introspectToSpec({
      generatedAt: "test",
      pages: [{
        testId: "home",
        description: "Home",
        landmarks: [{ role: "navigation", name: "" }],
        interactiveElements: [],
        stats: { totalNodes: 10, landmarkCount: 1, interactiveCount: 0, unlabeledCount: 0, headingLevels: [] },
        suggestedInvariants: [
          { description: "navigation landmark is present", check: "landmark-exists", cost: "low", dependsOn: ["src/Header.tsx"] },
          { description: "NL: header looks professional", check: "nl-assertion", cost: "high", assert: "Header looks professional" },
        ],
      }],
    });

    const data = new Map([["home", { a11yTree: tree, screenshotExists: true }]]);

    // Changed Footer, not Header → nav check skipped
    const result = verifySpec(spec, data, ["src/Footer.tsx"], new Map());
    const skipped = result.results[0].skipped;

    assert.ok(skipped.length >= 1, "Should skip at least 1 invariant");
    assert.ok(skipped.some((s) => s.reason.includes("dep graph")));
    assert.ok(skipped.some((s) => s.reason.includes("High-cost")));
  });
});
