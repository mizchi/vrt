/**
 * ワークフローハーネス品質テスト
 *
 * 10のfixture シナリオに対して:
 *   A) 正しい expectation → PASS するか
 *   B) 間違った expectation → FAIL するか
 *   C) expectation なし → 適切にリグレッション検出するか
 *
 * 全シナリオの結果をスコア化し、ハーネス自体の品質を定量化する。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot } from "./a11y-semantic.ts";
import { crossValidateWithExpectation } from "./expectation.ts";
import { reasonAboutChanges } from "./reasoning.ts";
import { introspectToSpec, verifySpec } from "./introspect.ts";
import type { A11yNode, PageExpectation, ChangeIntent, A11yDiff } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");

async function loadTree(filename: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, filename), "utf-8"));
}

function diff(baseline: A11yNode, snapshot: A11yNode): A11yDiff {
  const b = parsePlaywrightA11ySnapshot("t", "t", baseline as any);
  const s = parsePlaywrightA11ySnapshot("t", "t", snapshot as any);
  return diffA11yTrees(b, s);
}

interface ScenarioDef {
  name: string;
  snapshot: string;
  intent: ChangeIntent;
  correctExpectation: PageExpectation;
  wrongExpectation: PageExpectation;
  /** 正しい expectation で期待される verdict */
  expectVerdict: "realized" | "partially-realized" | "not-realized" | "unexpected-side-effects";
  /** expectation なしで spec 検証した際の期待 */
  specShouldFail: boolean;
}

const scenarios: ScenarioDef[] = [
  {
    name: "style-only (no a11y change)",
    snapshot: "snapshot-style-only.a11y.json",
    intent: { summary: "style: change button color", changeType: "style", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    correctExpectation: { testId: "home", expect: "No a11y changes, visual only", a11y: "no-change" },
    wrongExpectation: { testId: "home", expect: "Navigation removed", a11y: "regression-expected", expectedA11yChanges: [{ description: "Nav removed" }] },
    expectVerdict: "not-realized", // no changes → expectation for "no change" matches but reasoning says not-realized (nothing to realize)
    specShouldFail: false,
  },
  {
    name: "nav removed (intentional)",
    snapshot: "snapshot-nav-removed.a11y.json",
    intent: { summary: "style: hide nav on home", changeType: "style", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
    correctExpectation: {
      testId: "home", expect: "Navigation removed from header",
      expectedA11yChanges: [{ description: "Navigation landmark removed" }],
    },
    wrongExpectation: { testId: "home", expect: "No changes at all", a11y: "no-change" },
    expectVerdict: "realized",
    specShouldFail: true, // spec invariant "navigation exists" fails
  },
  {
    name: "search form added",
    snapshot: "snapshot-search-added.a11y.json",
    intent: { summary: "feat: add search", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
    correctExpectation: {
      testId: "home", expect: "Search landmark added to header",
      expectedA11yChanges: [{ description: "Search landmark added" }],
    },
    wrongExpectation: { testId: "home", expect: "No changes", a11y: "no-change" },
    expectVerdict: "realized",
    specShouldFail: false,
  },
  {
    name: "button renamed",
    snapshot: "snapshot-button-renamed.a11y.json",
    intent: { summary: "style: rename send to submit", changeType: "style", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
    correctExpectation: {
      testId: "home", expect: "Send button renamed to Submit",
      expectedA11yChanges: [{ description: "Button name changed from Send to Submit", name: "Send" }],
    },
    wrongExpectation: { testId: "home", expect: "Form removed", expectedA11yChanges: [{ description: "Form landmark removed" }] },
    expectVerdict: "realized",
    specShouldFail: false,
  },
  {
    name: "labels broken (regression)",
    snapshot: "snapshot-label-broken.a11y.json",
    intent: { summary: "refactor: extract utils", changeType: "refactor", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    correctExpectation: { testId: "home", expect: "No changes expected during refactor", a11y: "no-change" },
    wrongExpectation: { testId: "home", expect: "Labels added", a11y: "changed" },
    expectVerdict: "not-realized",
    specShouldFail: true, // labels missing → invariant fails
  },
  {
    name: "a11y fixed (improvement)",
    snapshot: "snapshot-a11y-fixed.a11y.json",
    intent: { summary: "a11y: fix form labels", changeType: "a11y", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
    correctExpectation: {
      testId: "home", expect: "Form elements get accessible labels",
      expectedA11yChanges: [
        { description: "Form gets name" },
        { description: "Email textbox gets label", role: "textbox" },
        { description: "Message textbox gets label", role: "textbox" },
        { description: "Button gets label" },
      ],
    },
    wrongExpectation: { testId: "home", expect: "No changes", a11y: "no-change" },
    expectVerdict: "realized",
    specShouldFail: false,
  },
  {
    name: "section added (feature)",
    snapshot: "snapshot-section-added.a11y.json",
    intent: { summary: "feat: add activity section", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
    correctExpectation: {
      testId: "home", expect: "Activity section added with region landmark",
      expectedA11yChanges: [{ description: "Region landmark added for recent activity" }],
    },
    wrongExpectation: { testId: "home", expect: "Navigation removed", expectedA11yChanges: [{ description: "Nav removed" }] },
    expectVerdict: "realized",
    specShouldFail: false,
  },
  {
    name: "form removed (destructive)",
    snapshot: "snapshot-form-removed.a11y.json",
    intent: { summary: "refactor: simplify home", changeType: "refactor", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    correctExpectation: { testId: "home", expect: "No a11y regression expected in refactor", a11y: "no-change" },
    wrongExpectation: { testId: "home", expect: "Search added", expectedA11yChanges: [{ description: "Search added" }] },
    expectVerdict: "not-realized",
    // form ランドマーク + element-count invariant で検出可能
    specShouldFail: true,
  },
  {
    name: "heading restructured",
    snapshot: "snapshot-heading-restructured.a11y.json",
    intent: { summary: "feat: restructure page layout", changeType: "feature", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: ["home"] },
    correctExpectation: {
      testId: "home", expect: "Heading structure changed: Welcome → Dashboard, new Overview and Contact Us headings",
      expectedA11yChanges: [
        { description: "Heading name changed from Welcome to Dashboard" },
        { description: "New heading Overview added" },
        { description: "New heading Contact Us added" },
      ],
    },
    wrongExpectation: { testId: "home", expect: "No changes", a11y: "no-change" },
    expectVerdict: "realized",
    specShouldFail: false,
  },
  {
    name: "role changed (link → button)",
    snapshot: "snapshot-role-changed.a11y.json",
    intent: { summary: "refactor: convert nav to buttons", changeType: "refactor", expectedVisualChanges: [], expectedA11yChanges: [], affectedComponents: [] },
    correctExpectation: { testId: "home", expect: "No a11y changes expected in refactor", a11y: "no-change" },
    wrongExpectation: { testId: "home", expect: "Search form added to header", a11y: "changed", expectedA11yChanges: [{ description: "Search landmark added" }] },
    expectVerdict: "not-realized",
    // element-count invariant で link→button の数の変化を検出可能
    specShouldFail: true,
  },
];

describe("Harness: full pipeline quality", () => {
  for (const sc of scenarios) {
    describe(sc.name, () => {
      it("correct expectation → cross-validation approves", async () => {
        const baseline = await loadTree("baseline.a11y.json");
        const snapshot = await loadTree(sc.snapshot);
        const d = diff(baseline, snapshot);

        const cv = crossValidateWithExpectation(
          "home", sc.correctExpectation, undefined, d.changes.length > 0 ? d : undefined, sc.intent
        );

        // style-only と regression cases: correct exp は no-change なので approve
        // 期待が変更ありの場合: 変更検出 + マッチ → approve
        if (sc.snapshot === "snapshot-style-only.a11y.json") {
          // no diff → no-change → approve
          assert.equal(cv.recommendation, "approve", `${sc.name}: ${cv.reasoning}`);
        } else if (sc.correctExpectation.a11y === "no-change" && d.changes.length > 0) {
          // Expects no change but there are changes → should NOT approve
          assert.notEqual(cv.recommendation, "approve", `${sc.name} should reject: ${cv.reasoning}`);
        } else {
          assert.equal(cv.recommendation, "approve", `${sc.name}: ${cv.reasoning}`);
        }
      });

      it("wrong expectation → cross-validation rejects/escalates", async () => {
        const baseline = await loadTree("baseline.a11y.json");
        const snapshot = await loadTree(sc.snapshot);
        const d = diff(baseline, snapshot);

        const cv = crossValidateWithExpectation(
          "home", sc.wrongExpectation, undefined, d.changes.length > 0 ? d : undefined, sc.intent
        );

        assert.notEqual(cv.recommendation, "approve", `${sc.name} wrong exp should not approve: ${cv.reasoning}`);
      });

      it("reasoning produces correct verdict", async () => {
        const baseline = await loadTree("baseline.a11y.json");
        const snapshot = await loadTree(sc.snapshot);
        const d = diff(baseline, snapshot);

        const chain = reasonAboutChanges("home", sc.correctExpectation, d.changes.length > 0 ? d : undefined, sc.intent);

        if (sc.expectVerdict === "not-realized" && d.changes.length === 0) {
          // No diff at all → no changes to realize
          assert.equal(chain.verdict, "not-realized", `${sc.name}: ${chain.reasoning}`);
        } else {
          assert.equal(chain.verdict, sc.expectVerdict, `${sc.name}: ${chain.reasoning}`);
        }
      });

      it("spec invariant correctly detects issues", async () => {
        const baseline = await loadTree("baseline.a11y.json");
        const snapshot = await loadTree(sc.snapshot);

        // Build spec from baseline (what "should" be true)
        const spec = introspectToSpec({
          generatedAt: "test",
          pages: [buildIntrospection(baseline)],
        });

        const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
        const result = verifySpec(spec, data);
        const hasFailed = result.results[0].checked.some((c) => !c.passed);

        if (sc.specShouldFail) {
          assert.ok(hasFailed, `${sc.name}: spec should detect issue but didn't`);
        }
        // Note: !specShouldFail doesn't guarantee all pass (e.g. heading changes are OK)
      });
    });
  }
});

// ---- Summary (runs after all tests) ----
describe("Harness: all 10 scenarios covered", () => {
  it("should have tested all scenario types", () => {
    assert.equal(scenarios.length, 10, "10 scenarios defined");
    const types = new Set(scenarios.map((s) => s.intent.changeType));
    assert.ok(types.has("style"), "Has style scenario");
    assert.ok(types.has("feature"), "Has feature scenario");
    assert.ok(types.has("refactor"), "Has refactor scenario");
    assert.ok(types.has("a11y"), "Has a11y scenario");
  });
});

// ---- Helpers ----

function buildIntrospection(tree: A11yNode) {
  const LANDMARK = new Set(["banner", "main", "navigation", "contentinfo", "form", "region", "search"]);
  const INTERACTIVE = new Set(["button", "link", "textbox", "checkbox", "radio", "searchbox"]);
  const landmarks: { role: string; name: string }[] = [];
  const interactive: { role: string; name: string; hasLabel: boolean }[] = [];

  function walk(node: A11yNode) {
    if (LANDMARK.has(node.role)) landmarks.push({ role: node.role, name: node.name || "" });
    if (INTERACTIVE.has(node.role)) interactive.push({ role: node.role, name: node.name || "", hasLabel: !!node.name });
    for (const c of node.children ?? []) walk(c);
  }
  walk(tree);

  return {
    testId: "home",
    description: "Home page",
    landmarks,
    interactiveElements: interactive,
    stats: { totalNodes: 0, landmarkCount: landmarks.length, interactiveCount: interactive.length, unlabeledCount: interactive.filter((e) => !e.hasLabel).length, headingLevels: [] },
    suggestedInvariants: [
      ...landmarks.map((l) => ({ description: `${l.role} landmark "${l.name || "(unnamed)"}" is present`, check: "landmark-exists" as const, cost: "low" as const })),
      ...(() => {
        const roleCounts = new Map<string, number>();
        for (const el of interactive) roleCounts.set(el.role, (roleCounts.get(el.role) ?? 0) + 1);
        return [...roleCounts].map(([role, count]) => ({
          description: `${count} ${role} element(s) expected`,
          check: "element-count" as const,
          cost: "low" as const,
        }));
      })(),
      { description: "All interactive elements have labels", check: "label-present" as const, cost: "low" as const },
      { description: "No whiteout", check: "no-whiteout" as const, cost: "low" as const },
    ],
  };
}
