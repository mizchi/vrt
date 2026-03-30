import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crossValidate } from "./cross-validation.ts";
import type { VisualSemanticDiff, A11yDiff, ChangeIntent } from "./types.ts";

const styleIntent: ChangeIntent = {
  summary: "style: change button color",
  changeType: "style",
  expectedVisualChanges: [
    { component: "Button", description: "color change", confidence: 0.8 },
  ],
  affectedComponents: ["src/Button.tsx"],
};

const refactorIntent: ChangeIntent = {
  summary: "refactor: extract utils",
  changeType: "refactor",
  expectedVisualChanges: [],
  affectedComponents: ["src/utils.ts"],
};

const a11yIntent: ChangeIntent = {
  summary: "a11y: add aria labels",
  changeType: "a11y",
  expectedVisualChanges: [],
  affectedComponents: ["src/Button.tsx"],
};

const visualDiff: VisualSemanticDiff = {
  testId: "Button",
  changes: [
    {
      type: "color-change",
      region: { x: 0, y: 0, width: 100, height: 50, diffPixelCount: 3000 },
      confidence: 0.8,
      description: "Color change",
    },
  ],
  summary: "1 color-change",
};

const a11yDiffClean: A11yDiff = {
  testId: "Button",
  changes: [
    {
      type: "name-changed",
      path: "main > button",
      before: { name: "Old" },
      after: { name: "New" },
      severity: "info",
      description: 'Name changed from "Old" to "New"',
    },
  ],
  hasRegression: false,
  landmarkChanges: [],
  stats: { added: 0, removed: 0, modified: 1 },
};

const a11yRegression: A11yDiff = {
  testId: "Button",
  changes: [
    {
      type: "node-removed",
      path: "main > button[Delete]",
      before: { role: "button", name: "Delete" },
      severity: "error",
      description: 'Removed button "Delete"',
    },
  ],
  hasRegression: true,
  landmarkChanges: [],
  stats: { added: 0, removed: 1, modified: 0 },
};

describe("crossValidate", () => {
  it("should approve when no changes", () => {
    const r = crossValidate("Button", undefined, undefined, styleIntent);
    assert.equal(r.recommendation, "approve");
    assert.equal(r.consistency, "consistent");
  });

  it("should approve visual+a11y with matching intent", () => {
    const r = crossValidate("Button", visualDiff, a11yDiffClean, styleIntent);
    assert.equal(r.recommendation, "approve");
    assert.equal(r.intentMatch, true);
  });

  it("should escalate visual+a11y without matching intent", () => {
    const r = crossValidate("Unknown", visualDiff, a11yDiffClean, styleIntent);
    assert.equal(r.recommendation, "escalate");
    assert.equal(r.intentMatch, false);
  });

  it("should approve visual-only for style intent", () => {
    const r = crossValidate("Button", visualDiff, undefined, styleIntent);
    assert.equal(r.recommendation, "approve");
    assert.equal(r.consistency, "visual-only");
  });

  it("should escalate visual-only for refactor intent", () => {
    const r = crossValidate("Button", visualDiff, undefined, refactorIntent);
    assert.equal(r.recommendation, "escalate");
    assert.equal(r.consistency, "visual-only");
  });

  it("should reject a11y-only change (semantic regression)", () => {
    const r = crossValidate("Button", undefined, a11yDiffClean, styleIntent);
    assert.equal(r.recommendation, "reject");
    assert.equal(r.consistency, "a11y-only");
  });

  it("should approve a11y-only for a11y intent", () => {
    const r = crossValidate("Button", undefined, a11yDiffClean, a11yIntent);
    assert.equal(r.recommendation, "approve");
    assert.equal(r.consistency, "a11y-only");
  });

  it("should reject on a11y regression regardless of intent", () => {
    const r = crossValidate("Button", visualDiff, a11yRegression, styleIntent);
    assert.equal(r.recommendation, "reject");
    assert.ok(r.reasoning.includes("regression"));
  });
});
