import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMigrationRegionApprovalContexts,
  classifyMigrationDiff,
  classifyMigrationVisualChange,
} from "./migration-diff.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import type { DiffRegion, VrtDiff } from "./types.ts";

function makeDiff(regions: DiffRegion[], totalPixels = 1_000_000): VrtDiff {
  const diffPixels = regions.reduce((sum, region) => sum + region.diffPixelCount, 0);
  return {
    snapshot: {
      testId: "migration-case",
      testTitle: "Migration Case",
      projectName: "migration",
      screenshotPath: "/tmp/current.png",
      baselinePath: "/tmp/baseline.png",
      status: "changed",
    },
    diffPixels,
    totalPixels,
    diffRatio: diffPixels / totalPixels,
    regions,
  };
}

describe("classifyMigrationVisualChange", () => {
  it("maps text-like changes to typography", () => {
    const diff = makeDiff([
      { x: 40, y: 120, width: 420, height: 20, diffPixelCount: 2200 },
    ]);
    const change = classifyVisualDiff(diff).changes[0];
    assert.equal(classifyMigrationVisualChange(change, diff), "typography");
  });

  it("maps dense color-only changes to color-change", () => {
    const diff = makeDiff([
      { x: 0, y: 0, width: 200, height: 100, diffPixelCount: 18000 },
    ]);
    const change = classifyVisualDiff(diff).changes[0];
    assert.equal(classifyMigrationVisualChange(change, diff), "color-change");
  });

  it("maps compact layout shifts to spacing", () => {
    const diff = makeDiff([
      { x: 80, y: 240, width: 120, height: 60, diffPixelCount: 3000 },
    ], 50_000);
    const change = classifyVisualDiff(diff).changes[0];
    assert.equal(change.type, "layout-shift");
    assert.equal(classifyMigrationVisualChange(change, diff), "spacing");
  });

  it("keeps large structural changes as layout-shift", () => {
    const diff = makeDiff([
      { x: 0, y: 0, width: 1000, height: 500, diffPixelCount: 100000 },
    ]);
    const change = classifyVisualDiff(diff).changes[0];
    assert.equal(classifyMigrationVisualChange(change, diff), "layout-shift");
  });
});

describe("classifyMigrationDiff", () => {
  it("aggregates category counts and dominant category", () => {
    const diff = makeDiff([
      { x: 10, y: 10, width: 32, height: 32, diffPixelCount: 800 },
      { x: 40, y: 120, width: 420, height: 20, diffPixelCount: 2200 },
      { x: 80, y: 240, width: 120, height: 60, diffPixelCount: 3000 },
    ], 50_000);

    const result = classifyMigrationDiff(diff);
    assert.equal(result.dominantCategory, "spacing");
    assert.equal(result.counts["spacing"], 1);
    assert.equal(result.counts["typography"], 1);
    assert.equal(result.counts["color-change"], 1);
    assert.match(result.summary, /spacing/);
    assert.match(result.summary, /typography/);
  });

  it("returns no changes for a null diff", () => {
    const result = classifyMigrationDiff(null);
    assert.equal(result.dominantCategory, "none");
    assert.equal(result.summary, "no changes");
  });
});

describe("buildMigrationRegionApprovalContexts", () => {
  it("maps each diff region to approval-friendly category and change type", () => {
    const diff = makeDiff([
      { x: 80, y: 240, width: 120, height: 60, diffPixelCount: 3000 },
      { x: 40, y: 120, width: 420, height: 20, diffPixelCount: 2200 },
      { x: 0, y: 0, width: 160, height: 80, diffPixelCount: 10000 },
    ], 50_000);

    const contexts = buildMigrationRegionApprovalContexts(diff);

    assert.equal(contexts.length, 3);
    assert.equal(contexts[0].migrationCategory, "spacing");
    assert.equal(contexts[0].category, "spacing");
    assert.equal(contexts[0].changeType, "geometry");
    assert.equal(contexts[1].migrationCategory, "typography");
    assert.equal(contexts[1].category, "typography");
    assert.equal(contexts[1].changeType, "text");
    assert.equal(contexts[2].migrationCategory, "color-change");
    assert.equal(contexts[2].category, "visual");
    assert.equal(contexts[2].changeType, "paint");
  });
});
