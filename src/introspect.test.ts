import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { A11yNode, UiSpec } from "./types.ts";

// Inline the functions to test (avoid fs dependency in unit tests)
// We test the core logic via introspectToSpec + verifySpec

import { introspectToSpec, verifySpec } from "./introspect.ts";
import type { IntrospectResult, PageIntrospection } from "./types.ts";

function makePage(testId: string, overrides: Partial<PageIntrospection> = {}): PageIntrospection {
  return {
    testId,
    description: `Page ${testId}`,
    landmarks: [{ role: "banner", name: "" }, { role: "main", name: "" }, { role: "navigation", name: "nav" }],
    interactiveElements: [
      { role: "button", name: "Submit", hasLabel: true },
      { role: "link", name: "Home", hasLabel: true },
    ],
    stats: { totalNodes: 20, landmarkCount: 3, interactiveCount: 2, unlabeledCount: 0, headingLevels: [1, 2] },
    suggestedInvariants: [
      { description: 'banner landmark "" is present', check: "landmark-exists", cost: "low" },
      { description: 'main landmark "" is present', check: "landmark-exists", cost: "low" },
      { description: 'navigation landmark "nav" is present', check: "landmark-exists", cost: "low" },
      { description: "All 2 interactive elements have labels", check: "label-present", cost: "low" },
      { description: "Page is not blank/whiteout", check: "no-whiteout", cost: "low" },
    ],
    ...overrides,
  };
}

describe("introspectToSpec", () => {
  it("should generate spec from introspect result", () => {
    const result: IntrospectResult = {
      generatedAt: "2026-01-01",
      pages: [makePage("home"), makePage("about")],
    };

    const spec = introspectToSpec(result);
    assert.equal(spec.pages.length, 2);
    assert.ok(spec.pages[0].invariants.length > 0);
    assert.ok(spec.global!.length > 0);
    assert.equal(spec.pages[0].testId, "home");
  });
});

describe("verifySpec", () => {
  const tree: A11yNode = {
    role: "document",
    name: "",
    children: [
      {
        role: "banner",
        name: "",
        children: [
          { role: "navigation", name: "nav", children: [{ role: "link", name: "Home" }] },
        ],
      },
      {
        role: "main",
        name: "",
        children: [
          { role: "heading", name: "Title", level: 1 },
          { role: "button", name: "Submit" },
        ],
      },
    ],
  };

  it("should pass all invariants for well-formed page", () => {
    const spec: UiSpec = {
      description: "test",
      pages: [{
        testId: "home",
        invariants: [
          { description: "banner landmark is present", check: "landmark-exists", cost: "low" },
          { description: "All elements labeled", check: "label-present", cost: "low" },
        ],
      }],
      global: [{ description: "No whiteout", check: "no-whiteout", cost: "low" }],
    };

    const data = new Map([["home", { a11yTree: tree, screenshotExists: true }]]);
    const result = verifySpec(spec, data);
    assert.equal(result.results.length, 1);
    assert.ok(result.results[0].checked.every((c) => c.passed));
  });

  it("should detect missing landmark", () => {
    const spec: UiSpec = {
      description: "test",
      pages: [{
        testId: "home",
        invariants: [
          { description: "search landmark is present", check: "landmark-exists", cost: "low" },
        ],
      }],
    };

    const data = new Map([["home", { a11yTree: tree, screenshotExists: true }]]);
    const result = verifySpec(spec, data);
    assert.ok(result.results[0].checked.some((c) => !c.passed));
  });

  it("should skip high-cost assertions", () => {
    const spec: UiSpec = {
      description: "test",
      pages: [{
        testId: "home",
        invariants: [
          { description: "The header looks professional", check: "nl-assertion", cost: "high", assert: "Header has clean design" },
        ],
      }],
    };

    const data = new Map([["home", { a11yTree: tree, screenshotExists: true }]]);
    const result = verifySpec(spec, data);
    assert.equal(result.results[0].checked.length, 0);
    assert.equal(result.results[0].skipped.length, 1);
    assert.ok(result.results[0].skipped[0].reason.includes("High-cost"));
  });

  it("should skip unaffected pages via dep graph", () => {
    const spec: UiSpec = {
      description: "test",
      pages: [{
        testId: "home",
        invariants: [
          { description: "Nav exists", check: "landmark-exists", cost: "low", dependsOn: ["src/Header.tsx"] },
        ],
      }],
    };

    const data = new Map([["home", { a11yTree: tree, screenshotExists: true }]]);
    // Changed files don't affect Header.tsx
    const result = verifySpec(spec, data, ["src/Footer.tsx"], new Map());
    assert.equal(result.results[0].checked.length, 0);
    assert.equal(result.results[0].skipped.length, 1);
    assert.ok(result.results[0].skipped[0].reason.includes("dep graph"));
  });

  it("should check invariant when dep graph says affected", () => {
    const spec: UiSpec = {
      description: "test",
      pages: [{
        testId: "home",
        invariants: [
          { description: "navigation landmark is present", check: "landmark-exists", cost: "low", dependsOn: ["src/Header.tsx"] },
        ],
      }],
    };

    const data = new Map([["home", { a11yTree: tree, screenshotExists: true }]]);
    // Changed files include Header.tsx
    const result = verifySpec(spec, data, ["src/Header.tsx"], new Map());
    assert.equal(result.results[0].checked.length, 1);
    assert.ok(result.results[0].checked[0].passed);
  });
});
