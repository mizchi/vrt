import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyVisualDiff } from "./visual-semantic.ts";
import type { VrtDiff, DiffRegion } from "./types.ts";

function makeDiff(regions: DiffRegion[], totalPixels = 1_000_000): VrtDiff {
  const diffPixels = regions.reduce((s, r) => s + r.diffPixelCount, 0);
  return {
    snapshot: {
      testId: "test-1",
      testTitle: "Test",
      projectName: "default",
      screenshotPath: "/tmp/test.png",
      baselinePath: "/tmp/baseline.png",
      status: "changed",
    },
    diffPixels,
    totalPixels,
    diffRatio: diffPixels / totalPixels,
    regions,
  };
}

describe("classifyVisualDiff", () => {
  it("should classify small square as icon-change", () => {
    const diff = makeDiff([
      { x: 10, y: 10, width: 32, height: 32, diffPixelCount: 800 },
    ]);
    const result = classifyVisualDiff(diff);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].type, "icon-change");
  });

  it("should classify wide thin region as text-change", () => {
    const diff = makeDiff([
      { x: 50, y: 100, width: 400, height: 20, diffPixelCount: 2000 },
    ]);
    const result = classifyVisualDiff(diff);
    assert.equal(result.changes[0].type, "text-change");
  });

  it("should classify high-density region as color-change", () => {
    const diff = makeDiff([
      { x: 0, y: 0, width: 200, height: 100, diffPixelCount: 18000 },
    ]);
    const result = classifyVisualDiff(diff);
    assert.equal(result.changes[0].type, "color-change");
  });

  it("should classify large region as layout-shift", () => {
    const diff = makeDiff([
      { x: 0, y: 0, width: 1000, height: 500, diffPixelCount: 100000 },
    ]);
    const result = classifyVisualDiff(diff);
    assert.equal(result.changes[0].type, "layout-shift");
  });

  it("should group adjacent layout shifts", () => {
    const diff = makeDiff([
      { x: 0, y: 100, width: 500, height: 200, diffPixelCount: 60000 },
      { x: 500, y: 120, width: 300, height: 180, diffPixelCount: 40000 },
    ]);
    const result = classifyVisualDiff(diff);
    // Both should be layout shifts, and grouped into 1
    const layoutShifts = result.changes.filter(
      (c) => c.type === "layout-shift"
    );
    assert.equal(layoutShifts.length, 1);
  });

  it("should generate summary", () => {
    const diff = makeDiff([
      { x: 10, y: 10, width: 32, height: 32, diffPixelCount: 800 },
      { x: 50, y: 100, width: 400, height: 20, diffPixelCount: 2000 },
    ]);
    const result = classifyVisualDiff(diff);
    assert.ok(result.summary.includes("icon-change"));
    assert.ok(result.summary.includes("text-change"));
  });

  it("should handle empty diff", () => {
    const diff = makeDiff([]);
    const result = classifyVisualDiff(diff);
    assert.equal(result.changes.length, 0);
    assert.equal(result.summary, "no changes");
  });
});
