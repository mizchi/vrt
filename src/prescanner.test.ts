import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ViewportDetectionResult } from "./detection-classify.ts";
import {
  hasAnyDetectionSignal,
  hasCraterPrescanSignal,
  resolvePrescannerTrial,
  summarizePrescannerTrials,
} from "./prescanner.ts";

function makeViewportResult(
  overrides: Partial<ViewportDetectionResult> = {},
): ViewportDetectionResult {
  return {
    width: 1280,
    height: 900,
    visualDiffDetected: false,
    visualDiffRatio: 0,
    a11yDiffDetected: false,
    a11yChangeCount: 0,
    computedStyleDiffCount: 0,
    hoverDiffDetected: false,
    paintTreeDiffCount: 0,
    ...overrides,
  };
}

describe("hasCraterPrescanSignal", () => {
  it("treats paint tree changes as crater detection", () => {
    assert.equal(hasCraterPrescanSignal([
      makeViewportResult({ paintTreeDiffCount: 2 }),
    ]), true);
  });

  it("does not treat computed style only changes as crater detection", () => {
    assert.equal(hasCraterPrescanSignal([
      makeViewportResult({ computedStyleDiffCount: 3 }),
    ]), false);
  });
});

describe("hasAnyDetectionSignal", () => {
  it("treats chromium-only signals as detection", () => {
    assert.equal(hasAnyDetectionSignal([
      makeViewportResult({ computedStyleDiffCount: 1 }),
    ]), true);
    assert.equal(hasAnyDetectionSignal([
      makeViewportResult({ hoverDiffDetected: true }),
    ]), true);
  });
});

describe("resolvePrescannerTrial", () => {
  it("resolves on crater without fallback when crater sees a signal", () => {
    const resolution = resolvePrescannerTrial([
      makeViewportResult({ visualDiffDetected: true, visualDiffRatio: 0.02 }),
    ]);

    assert.deepEqual(resolution, {
      craterDetected: true,
      fallbackUsed: false,
      finalDetected: true,
      resolvedBy: "crater",
    });
  });

  it("falls back to chromium when crater is silent and detects chromium-only signals", () => {
    const resolution = resolvePrescannerTrial(
      [makeViewportResult()],
      [makeViewportResult({ computedStyleDiffCount: 2 })],
    );

    assert.deepEqual(resolution, {
      craterDetected: false,
      fallbackUsed: true,
      finalDetected: true,
      resolvedBy: "chromium",
    });
  });

  it("returns pass when both crater and chromium are silent", () => {
    const resolution = resolvePrescannerTrial(
      [makeViewportResult()],
      [makeViewportResult()],
    );

    assert.deepEqual(resolution, {
      craterDetected: false,
      fallbackUsed: true,
      finalDetected: false,
      resolvedBy: "none",
    });
  });
});

describe("summarizePrescannerTrials", () => {
  it("counts crater resolution and chromium fallback separately", () => {
    const summary = summarizePrescannerTrials([
      { craterDetected: true, fallbackUsed: false, finalDetected: true, resolvedBy: "crater" },
      { craterDetected: false, fallbackUsed: true, finalDetected: true, resolvedBy: "chromium" },
      { craterDetected: false, fallbackUsed: true, finalDetected: false, resolvedBy: "none" },
    ]);

    assert.deepEqual(summary, {
      total: 3,
      detected: 2,
      craterResolved: 1,
      chromiumFallbacks: 2,
      chromiumDetected: 1,
      passedAfterFallback: 1,
    });
  });
});
