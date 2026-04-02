import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaintTreeChange } from "./crater-client.ts";
import type { VrtDiff, VrtSnapshot } from "./types.ts";
import {
  applyApprovalToVrtDiff,
  collectApprovalWarnings,
  filterApprovedVrtRegions,
  filterApprovedPaintTreeChanges,
  inferApprovalChangeType,
  mergeApprovalManifest,
  normalizeApprovalDecision,
  parseApprovalManifest,
  suggestApprovalRule,
} from "./approval.ts";

const snapshot: VrtSnapshot = {
  testId: "page",
  testTitle: "page",
  projectName: "test",
  screenshotPath: "/tmp/current.png",
  baselinePath: "/tmp/baseline.png",
  status: "changed",
};

function createDiff(overrides: Partial<VrtDiff> = {}): VrtDiff {
  return {
    snapshot,
    diffPixels: 40,
    totalPixels: 1000,
    diffRatio: 0.04,
    heatmapPath: "/tmp/heatmap.png",
    regions: [{ x: 0, y: 0, width: 32, height: 32, diffPixelCount: 40 }],
    ...overrides,
  };
}

describe("parseApprovalManifest", () => {
  it("should parse a valid manifest", () => {
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          selector: ".header",
          property: "padding",
          category: "spacing",
          changeType: "paint",
          tolerance: { pixels: 60, ratio: 0.1 },
          reason: "known renderer drift",
          issue: "mizchi/crater#21",
          expires: "2026-06-01",
        },
      ],
    }));

    assert.equal(manifest.rules.length, 1);
    assert.equal(manifest.rules[0].selector, ".header");
    assert.equal(manifest.rules[0].tolerance?.pixels, 60);
  });

  it("should reject a rule without reason", () => {
    assert.throws(
      () => parseApprovalManifest(JSON.stringify({ rules: [{ property: "color" }] })),
      /reason/i,
    );
  });
});

describe("applyApprovalToVrtDiff", () => {
  it("should approve a matching pixel diff within tolerance", () => {
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          selector: ".header",
          property: "padding",
          category: "spacing",
          changeType: "paint",
          tolerance: { pixels: 50, ratio: 0.05 },
          reason: "small known drift",
        },
      ],
    }));

    const result = applyApprovalToVrtDiff(
      createDiff(),
      manifest,
      { selector: ".header", property: "padding", category: "spacing", changeType: "paint" },
    );

    assert.equal(result.approved, true);
    assert.equal(result.diff.diffPixels, 0);
    assert.equal(result.diff.diffRatio, 0);
    assert.equal(result.diff.regions.length, 0);
    assert.equal(result.matchedRules.length, 1);
  });

  it("should ignore approval rules in strict mode", () => {
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          property: "padding",
          changeType: "paint",
          tolerance: { pixels: 50 },
          reason: "small known drift",
        },
      ],
    }));

    const result = applyApprovalToVrtDiff(
      createDiff(),
      manifest,
      { property: "padding", changeType: "paint" },
      { strict: true },
    );

    assert.equal(result.approved, false);
    assert.equal(result.diff.diffPixels, 40);
    assert.equal(result.diff.diffRatio, 0.04);
  });

  it("should warn for expired rules and stop applying them", () => {
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          property: "color",
          changeType: "paint",
          tolerance: { pixels: 50 },
          reason: "temporary approval",
          expires: "2026-03-01",
        },
      ],
    }));
    const now = new Date("2026-04-02T12:00:00+09:00");

    const warnings = collectApprovalWarnings(manifest, { now });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /expired/i);

    const result = applyApprovalToVrtDiff(
      createDiff(),
      manifest,
      { property: "color", changeType: "paint" },
      { now },
    );
    assert.equal(result.approved, false);
    assert.equal(result.diff.diffPixels, 40);
  });
});

describe("filterApprovedPaintTreeChanges", () => {
  it("should filter only paint tree changes that fit the tolerance", () => {
    const changes: PaintTreeChange[] = [
      {
        path: "root > div[0]",
        type: "paint",
        property: "background",
        before: "[255,255,255,255]",
        after: "[250,250,250,255]",
      },
      {
        path: "root > div[1]",
        type: "geometry",
        property: "bounds",
        before: "0,0 100x40",
        after: "0,7 100x40",
      },
    ];
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          property: "background",
          changeType: "paint",
          tolerance: { colorDelta: 8 },
          reason: "minor background color drift",
        },
        {
          property: "bounds",
          changeType: "geometry",
          tolerance: { geometryDelta: 4 },
          reason: "tiny layout shift",
        },
      ],
    }));

    const result = filterApprovedPaintTreeChanges(changes, manifest);

    assert.equal(result.approvedChanges.length, 1);
    assert.equal(result.remainingChanges.length, 1);
    assert.equal(result.approvedChanges[0].property, "background");
    assert.equal(result.remainingChanges[0].property, "bounds");
  });

  it("should match declaration context even when paint tree property differs", () => {
    const changes: PaintTreeChange[] = [
      {
        path: "root > div[0]",
        type: "geometry",
        property: "bounds",
        before: "0,0 100x40",
        after: "0,3 100x40",
      },
    ];
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          selector: ".card",
          property: "margin-left",
          category: "spacing",
          changeType: "geometry",
          tolerance: { geometryDelta: 4 },
          reason: "small spacing drift",
        },
      ],
    }));

    const result = filterApprovedPaintTreeChanges(
      changes,
      manifest,
      { selector: ".card", property: "margin-left", category: "spacing" },
    );

    assert.equal(result.approvedChanges.length, 1);
    assert.equal(result.remainingChanges.length, 0);
  });
});

describe("filterApprovedVrtRegions", () => {
  it("should approve only matching regions and keep the rest", () => {
    const diff = createDiff({
      diffPixels: 100,
      diffRatio: 0.1,
      regions: [
        { x: 0, y: 0, width: 20, height: 20, diffPixelCount: 40 },
        { x: 40, y: 0, width: 20, height: 20, diffPixelCount: 60 },
      ],
    });
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          category: "spacing",
          changeType: "geometry",
          tolerance: { pixels: 50, ratio: 0.05 },
          reason: "known compact spacing drift",
        },
      ],
    }));

    const result = filterApprovedVrtRegions(diff, manifest, [
      { category: "spacing", changeType: "geometry" },
      { category: "visual", changeType: "paint" },
    ]);

    assert.equal(result.approved, false);
    assert.equal(result.approvedRegions.length, 1);
    assert.equal(result.remainingRegions.length, 1);
    assert.equal(result.diff.diffPixels, 60);
    assert.equal(result.diff.diffRatio, 0.06);
    assert.equal(result.diff.regions.length, 1);
    assert.equal(result.diff.heatmapPath, undefined);
    assert.equal(result.matchedRules.length, 1);
  });

  it("should preserve raw diff pixels when region weights are larger than diffPixels", () => {
    const diff = createDiff({
      diffPixels: 1600,
      totalPixels: 1_296_000,
      diffRatio: 1600 / 1_296_000,
      regions: [
        { x: 0, y: 0, width: 1440, height: 928, diffPixelCount: 1_296_000 },
      ],
    });
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          category: "spacing",
          changeType: "geometry",
          tolerance: { pixels: 50, ratio: 0.001 },
          reason: "unrelated rule",
        },
      ],
    }));

    const result = filterApprovedVrtRegions(diff, manifest, [
      { category: "visual", changeType: "paint" },
    ]);

    assert.equal(result.approved, false);
    assert.equal(result.diff.diffPixels, 1600);
    assert.equal(result.diff.diffRatio, 1600 / 1_296_000);
    assert.equal(result.diff.regions.length, 1);
  });
});

describe("inferApprovalChangeType", () => {
  it("should infer geometry for spacing properties", () => {
    assert.equal(inferApprovalChangeType("margin-left", "spacing"), "geometry");
  });

  it("should infer text for text-shaping properties", () => {
    assert.equal(inferApprovalChangeType("text-transform", "typography"), "text");
  });

  it("should infer paint for visual properties", () => {
    assert.equal(inferApprovalChangeType("background-color", "visual"), "paint");
  });
});

describe("suggestApprovalRule", () => {
  it("should generate geometry tolerance from diff metrics", () => {
    const rule = suggestApprovalRule({
      selector: ".card",
      property: "margin-left",
      category: "spacing",
      maxDiffPixels: 32,
      maxDiffRatio: 0.0321,
      paintTreeChanges: [
        {
          path: "root > div[0]",
          type: "geometry",
          property: "bounds",
          before: "0,0 100x40",
          after: "0,3 101x40",
        },
      ],
    });

    assert.equal(rule.selector, ".card");
    assert.equal(rule.changeType, "geometry");
    assert.equal(rule.tolerance?.pixels, 32);
    assert.equal(rule.tolerance?.ratio, 0.0321);
    assert.equal(rule.tolerance?.geometryDelta, 3);
    assert.match(rule.reason, /TODO:/);
  });

  it("should generate color tolerance for paint changes", () => {
    const rule = suggestApprovalRule({
      selector: ".button:hover",
      property: "background-color",
      category: "visual",
      paintTreeChanges: [
        {
          path: "root > button[0]",
          type: "paint",
          property: "background",
          before: "[255,255,255,255]",
          after: "[250,248,247,255]",
        },
      ],
      reason: "known hover palette drift",
    });

    assert.equal(rule.changeType, "paint");
    assert.equal(rule.tolerance?.colorDelta, 8);
    assert.equal(rule.reason, "known hover palette drift");
  });
});

describe("mergeApprovalManifest", () => {
  it("should append newly approved rules", () => {
    const manifest = parseApprovalManifest(JSON.stringify({ rules: [] }));
    const merged = mergeApprovalManifest(manifest, [
      {
        selector: ".card",
        property: "margin-left",
        category: "spacing",
        changeType: "geometry",
        tolerance: { geometryDelta: 4 },
        reason: "known drift",
      },
    ]);

    assert.equal(merged.rules.length, 1);
    assert.equal(merged.rules[0].selector, ".card");
  });

  it("should replace an existing rule with the same identity", () => {
    const manifest = parseApprovalManifest(JSON.stringify({
      rules: [
        {
          selector: ".card",
          property: "margin-left",
          category: "spacing",
          changeType: "geometry",
          tolerance: { geometryDelta: 2 },
          reason: "old reason",
        },
      ],
    }));

    const merged = mergeApprovalManifest(manifest, [
      {
        selector: ".card",
        property: "margin-left",
        category: "spacing",
        changeType: "geometry",
        tolerance: { geometryDelta: 4 },
        reason: "new reason",
      },
    ]);

    assert.equal(merged.rules.length, 1);
    assert.equal(merged.rules[0].tolerance?.geometryDelta, 4);
    assert.equal(merged.rules[0].reason, "new reason");
  });
});

describe("normalizeApprovalDecision", () => {
  it("should normalize approve aliases", () => {
    assert.equal(normalizeApprovalDecision("a"), "approve");
    assert.equal(normalizeApprovalDecision("approve"), "approve");
  });

  it("should normalize reject aliases", () => {
    assert.equal(normalizeApprovalDecision("r"), "reject");
    assert.equal(normalizeApprovalDecision("reject"), "reject");
  });

  it("should normalize skip aliases", () => {
    assert.equal(normalizeApprovalDecision(""), "skip");
    assert.equal(normalizeApprovalDecision("s"), "skip");
    assert.equal(normalizeApprovalDecision("skip"), "skip");
  });

  it("should return null for invalid input", () => {
    assert.equal(normalizeApprovalDecision("wat"), null);
  });
});
