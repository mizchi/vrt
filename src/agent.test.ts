import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runVerificationLoop, generateReport } from "./agent.ts";
import type { VrtDiff, ChangeIntent, QualityCheckResult } from "./types.ts";

function makeDiff(
  testId: string,
  diffRatio: number,
  opts: Partial<VrtDiff> = {}
): VrtDiff {
  return {
    snapshot: {
      testId,
      testTitle: testId,
      projectName: "default",
      screenshotPath: `/tmp/${testId}.png`,
      baselinePath: `/tmp/${testId}_baseline.png`,
      status: "changed",
    },
    diffPixels: Math.floor(diffRatio * 1000000),
    totalPixels: 1000000,
    diffRatio,
    regions: [
      { x: 0, y: 0, width: 100, height: 100, diffPixelCount: Math.floor(diffRatio * 1000000) },
    ],
    ...opts,
  };
}

const baseIntent: ChangeIntent = {
  summary: "style: change button color",
  changeType: "style",
  expectedVisualChanges: [
    {
      component: "Button",
      description: "Button color changes from blue to green",
      confidence: 0.8,
    },
  ],
  expectedA11yChanges: [],
  affectedComponents: ["src/Button.tsx"],
};

describe("runVerificationLoop", () => {
  it("should auto-approve tiny diffs", async () => {
    const diffs = [makeDiff("Button", 0.0005)]; // 0.05%
    const result = await runVerificationLoop(diffs, baseIntent, []);

    assert.equal(result.verdicts.length, 1);
    assert.equal(result.verdicts[0].decision, "approve");
    assert.ok(result.verdicts[0].reasoning.includes("noise threshold"));
  });

  it("should approve diffs matching intent", async () => {
    const diffs = [makeDiff("Button", 0.05)]; // 5%
    const result = await runVerificationLoop(diffs, baseIntent, []);

    assert.equal(result.verdicts[0].decision, "approve");
    assert.ok(result.verdicts[0].matchedIntent);
  });

  it("should reject large diffs with quality failures", async () => {
    const diffs = [makeDiff("Page", 0.9)]; // 90%
    const checks: QualityCheckResult[] = [
      {
        check: "whiteout",
        passed: false,
        details: "Whiteout detected",
        severity: "error",
      },
    ];

    const result = await runVerificationLoop(diffs, baseIntent, checks);
    assert.equal(result.verdicts[0].decision, "reject");
  });

  it("should escalate unmatched medium diffs", async () => {
    const diffs = [makeDiff("UnknownComponent", 0.15)]; // 15%, no intent match
    const result = await runVerificationLoop(diffs, baseIntent, []);

    assert.equal(result.verdicts[0].decision, "escalate");
  });

  it("should handle empty diffs", async () => {
    const result = await runVerificationLoop([], baseIntent, []);
    assert.equal(result.verdicts.length, 0);
  });
});

describe("generateReport", () => {
  it("should generate readable report", async () => {
    const diffs = [makeDiff("Button", 0.05), makeDiff("Unknown", 0.2)];
    const ctx = await runVerificationLoop(diffs, baseIntent, []);
    const report = generateReport(ctx);

    assert.ok(report.includes("VRT Verification Report"));
    assert.ok(report.includes("Approved:"));
    assert.ok(report.includes("Escalated:"));
  });
});
