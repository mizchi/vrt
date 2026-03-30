/**
 * Introspect → Spec → Verify ラウンドトリップテスト
 *
 * 1. baseline から introspect → spec 生成
 * 2. 各 snapshot に対して spec を verify
 * 3. 変更に応じて pass/fail が正しいことを確認
 *
 * これにより long-cycle の spec → verify パスが統合的に動くことを保証する。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { introspectToSpec, verifySpec } from "./introspect.ts";
import { checkA11yTree } from "./a11y-semantic.ts";
import type { A11yNode, UiSpec } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");

async function loadTree(filename: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, filename), "utf-8"));
}

// introspect の入力は PageIntrospection。fixtures から直接構築。
function introspectFromTree(testId: string, tree: A11yNode) {
  const LANDMARK = new Set(["banner", "main", "navigation", "contentinfo", "form", "region", "search"]);
  const INTERACTIVE = new Set(["button", "link", "textbox", "checkbox", "radio", "searchbox", "switch"]);
  const landmarks: { role: string; name: string }[] = [];
  const interactive: { role: string; name: string; hasLabel: boolean }[] = [];
  let totalNodes = 0;
  const headingLevels: number[] = [];

  function walk(node: A11yNode) {
    totalNodes++;
    if (LANDMARK.has(node.role)) landmarks.push({ role: node.role, name: node.name || "" });
    if (INTERACTIVE.has(node.role)) interactive.push({ role: node.role, name: node.name || "", hasLabel: !!node.name });
    if (node.role === "heading" && node.level) headingLevels.push(node.level);
    for (const c of node.children ?? []) walk(c);
  }
  walk(tree);

  const roleCounts = new Map<string, number>();
  for (const el of interactive) roleCounts.set(el.role, (roleCounts.get(el.role) ?? 0) + 1);

  return {
    testId,
    description: `Page ${testId}`,
    landmarks,
    interactiveElements: interactive,
    stats: { totalNodes, landmarkCount: landmarks.length, interactiveCount: interactive.length, unlabeledCount: interactive.filter((e) => !e.hasLabel).length, headingLevels: [...new Set(headingLevels)].sort() },
    suggestedInvariants: [
      ...landmarks.map((l) => ({ description: `${l.role} landmark "${l.name || "(unnamed)"}" is present`, check: "landmark-exists" as const, cost: "low" as const })),
      ...[...roleCounts].map(([role, count]) => ({
        description: `${count} ${role} element(s) expected`,
        check: "element-count" as const,
        cost: "low" as const,
      })),
      { description: "All interactive elements have labels", check: "label-present" as const, cost: "low" as const },
      { description: "No whiteout", check: "no-whiteout" as const, cost: "low" as const },
    ],
  };
}

describe("Round-trip: introspect → spec → verify", () => {
  let baselineSpec: UiSpec;

  it("should generate spec from baseline", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const introspection = introspectFromTree("home", baseline);
    baselineSpec = introspectToSpec({ generatedAt: "test", pages: [introspection] });

    assert.ok(baselineSpec.pages.length === 1);
    assert.ok(baselineSpec.pages[0].invariants.length > 5, `Should have many invariants: ${baselineSpec.pages[0].invariants.length}`);
    assert.ok(baselineSpec.global!.length > 0);

    // Check specific invariants exist
    const descs = baselineSpec.pages[0].invariants.map((i) => i.description);
    assert.ok(descs.some((d) => d.includes("banner")), "Should have banner invariant");
    assert.ok(descs.some((d) => d.includes("navigation")), "Should have navigation invariant");
    assert.ok(descs.some((d) => d.includes("form")), "Should have form invariant");
    assert.ok(descs.some((d) => d.includes("link")), "Should have link element-count");
    assert.ok(descs.some((d) => d.includes("button")), "Should have button element-count");
  });

  it("should PASS for identical baseline", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const data = new Map([["home", { a11yTree: baseline, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    assert.equal(failed.length, 0, `All should pass: ${failed.map((f) => f.invariant.description).join(", ")}`);
  });

  it("should PASS for style-only change (identical a11y)", async () => {
    const snapshot = await loadTree("snapshot-style-only.a11y.json");
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    assert.equal(failed.length, 0, "Style-only should pass all invariants");
  });

  it("should FAIL for nav-removed (landmark missing)", async () => {
    const snapshot = await loadTree("snapshot-nav-removed.a11y.json");
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    assert.ok(failed.length > 0, "Should detect failures");
    assert.ok(
      failed.some((f) => f.invariant.description.includes("navigation")),
      `Should fail on navigation: ${failed.map((f) => f.invariant.description).join(", ")}`
    );
  });

  it("should FAIL for form-removed (landmark + element count)", async () => {
    const snapshot = await loadTree("snapshot-form-removed.a11y.json");
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    assert.ok(failed.length > 0, "Should detect form removal");
    assert.ok(
      failed.some((f) => f.invariant.description.includes("form")),
      `Should fail on form: ${failed.map((f) => f.invariant.description).join(", ")}`
    );
  });

  it("should FAIL for label-broken (unlabeled elements)", async () => {
    const snapshot = await loadTree("snapshot-label-broken.a11y.json");
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    assert.ok(
      failed.some((f) => f.invariant.check === "label-present"),
      `Should fail on labels: ${failed.map((f) => `${f.invariant.check}: ${f.reasoning}`).join(", ")}`
    );
  });

  it("should FAIL for role-changed (element count mismatch)", async () => {
    const snapshot = await loadTree("snapshot-role-changed.a11y.json");
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    assert.ok(failed.length > 0, "Should detect role change via element count");
    // link count changed (3 link → 0 link, 3 button → 6 button)
    assert.ok(
      failed.some((f) => f.invariant.check === "element-count"),
      `Should fail on element-count: ${failed.map((f) => `${f.invariant.description}: ${f.reasoning}`).join("; ")}`
    );
  });

  it("should PASS for search-added (additions don't break invariants)", async () => {
    const snapshot = await loadTree("snapshot-search-added.a11y.json");
    const data = new Map([["home", { a11yTree: snapshot, screenshotExists: true }]]);
    const result = verifySpec(baselineSpec, data);

    const failed = result.results[0].checked.filter((c) => !c.passed);
    // Adding search doesn't break existing invariants (links/buttons still exist)
    // But element-count for searchbox/button may differ
    // The key assertion: navigation, banner, main, form still pass
    const landmarkFails = failed.filter((f) => f.invariant.check === "landmark-exists");
    assert.equal(landmarkFails.length, 0, "Existing landmarks should still pass");
  });

  it("should detect a11y quality issues via checkA11yTree", async () => {
    const broken = await loadTree("snapshot-label-broken.a11y.json");
    const issues = checkA11yTree(broken);
    assert.ok(issues.length >= 3, `Should find 3+ issues: ${issues.length}`);
    assert.ok(issues.every((i) => i.rule === "label-missing"), "All should be label-missing");
  });
});
