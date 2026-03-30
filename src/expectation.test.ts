import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchA11yExpectation, crossValidateWithExpectation, scoreLoop } from "./expectation.ts";
import type { PageExpectation, A11yDiff, ChangeIntent, UnifiedAgentContext, VrtExpectation } from "./types.ts";

const navRemovalDiff: A11yDiff = {
  testId: "home",
  changes: [
    {
      type: "landmark-changed",
      path: 'banner > navigation[navigation]',
      before: { role: "navigation", name: "navigation" },
      severity: "error",
      description: 'Removed navigation "navigation"',
    },
    {
      type: "name-changed",
      path: "banner > link[bithub]",
      before: { name: "bithub home" },
      after: { name: "bithub" },
      severity: "info",
      description: 'Name changed from "bithub home" to "bithub"',
    },
  ],
  hasRegression: true,
  landmarkChanges: [
    {
      type: "landmark-changed",
      path: 'banner > navigation[navigation]',
      before: { role: "navigation", name: "navigation" },
      severity: "error",
      description: 'Removed navigation "navigation"',
    },
  ],
  stats: { added: 0, removed: 0, modified: 2 },
};

describe("matchA11yExpectation", () => {
  it("should match expected regression", () => {
    const exp: PageExpectation = {
      testId: "home",
      visual: "changed",
      a11y: "regression-expected",
      expectedA11yChanges: [
        {
          type: "landmark-changed",
          role: "navigation",
          description: "Navigation landmark removed from home page",
        },
      ],
    };

    const result = matchA11yExpectation(exp, navRemovalDiff);
    assert.equal(result.matched, true);
    assert.ok(result.matchedChanges.length > 0);
    assert.ok(result.reasoning.includes("verified"));
  });

  it("should fail when expected regression doesn't occur", () => {
    const exp: PageExpectation = {
      testId: "home",
      visual: "any",
      a11y: "regression-expected",
      expectedA11yChanges: [
        {
          type: "landmark-changed",
          role: "navigation",
          description: "Expected nav removal",
        },
      ],
    };

    const result = matchA11yExpectation(exp, undefined);
    assert.equal(result.matched, false);
    assert.ok(result.reasoning.includes("no changes detected"));
  });

  it("should match no-change expectation", () => {
    const exp: PageExpectation = {
      testId: "readme",
      visual: "no-change",
      a11y: "no-change",
    };

    const result = matchA11yExpectation(exp, undefined);
    assert.equal(result.matched, true);
  });

  it("should fail no-change when changes exist", () => {
    const exp: PageExpectation = {
      testId: "home",
      visual: "any",
      a11y: "no-change",
    };

    const result = matchA11yExpectation(exp, navRemovalDiff);
    assert.equal(result.matched, false);
  });

  it("should accept any changes with 'any'", () => {
    const exp: PageExpectation = {
      testId: "home",
      visual: "any",
      a11y: "any",
    };

    const result = matchA11yExpectation(exp, navRemovalDiff);
    assert.equal(result.matched, true);
  });
});

describe("crossValidateWithExpectation", () => {
  const intent: ChangeIntent = {
    summary: "style: hide nav on home",
    changeType: "style",
    expectedVisualChanges: [],
    expectedA11yChanges: [],
    affectedComponents: ["home"],
  };

  it("should approve when regression-expected matches", () => {
    const exp: PageExpectation = {
      testId: "home",
      visual: "changed",
      a11y: "regression-expected",
      expectedA11yChanges: [
        { type: "landmark-changed", role: "navigation", description: "Nav removed" },
      ],
    };

    const visualDiff = {
      testId: "home",
      changes: [{ type: "layout-shift" as const, region: { x: 0, y: 0, width: 100, height: 20, diffPixelCount: 1000 }, confidence: 0.5, description: "Nav area" }],
      summary: "1 layout-shift",
    };

    const result = crossValidateWithExpectation("home", exp, visualDiff, navRemovalDiff, intent);
    assert.equal(result.recommendation, "approve");
  });

  it("should reject when expected regression not detected", () => {
    const exp: PageExpectation = {
      testId: "home",
      visual: "any",
      a11y: "regression-expected",
      expectedA11yChanges: [
        { type: "landmark-changed", role: "navigation", description: "Nav removed" },
      ],
    };

    const result = crossValidateWithExpectation("home", exp, undefined, undefined, intent);
    assert.equal(result.recommendation, "reject");
  });
});

describe("scoreLoop", () => {
  it("should compute scores", () => {
    const ctx: UnifiedAgentContext = {
      intent: {
        summary: "style: hide nav",
        changeType: "style",
        expectedVisualChanges: [],
        expectedA11yChanges: [],
        affectedComponents: [],
      },
      vrtDiffs: [],
      a11yDiffs: [],
      visualSemanticDiffs: [],
      crossValidations: [],
      verdicts: [],
      qualityChecks: [],
    };

    const score = scoreLoop(ctx, undefined, {
      fixSteps: 2,
      tokenUsage: 40000,
      startTime: 0,
      endTime: 1000,
    });

    assert.ok(score.usability >= 0 && score.usability <= 100);
    assert.ok(score.practicality >= 0);
    assert.equal(score.fixSteps, 2);
    assert.ok(score.details.length > 0);
  });
});
