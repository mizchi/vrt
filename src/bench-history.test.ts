import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  appendBenchHistory,
  buildBenchHistoryRecord,
  getBenchHistoryPath,
  getBenchHistoryStats,
  readBenchHistory,
  type BenchHistoryRecord,
} from "./bench-history.ts";

function makeRecord(overrides: Partial<BenchHistoryRecord> = {}): BenchHistoryRecord {
  return {
    runId: "2026-04-02T00:00:00.000Z",
    fixture: "page",
    backend: "chromium",
    trials: 10,
    startSeed: 1,
    elapsedMs: 6000,
    avgMsPerTrial: 600,
    llmEnabled: false,
    strict: false,
    suggestApproval: false,
    approvalPath: undefined,
    visualDetected: 8,
    computedDetected: 4,
    hoverDetected: 1,
    paintTreeDetected: 0,
    a11yDetected: 0,
    eitherDetected: 9,
    neitherDetected: 1,
    detectionRate: 0.9,
    prescanner: null,
    ...overrides,
  };
}

describe("getBenchHistoryPath", () => {
  it("stores benchmark history under data", () => {
    assert.match(getBenchHistoryPath(), /data\/bench-history\.jsonl$/);
  });
});

describe("buildBenchHistoryRecord", () => {
  it("derives avgMsPerTrial and detectionRate", () => {
    const record = buildBenchHistoryRecord({
      runId: "2026-04-02T00:00:00.000Z",
      fixture: "page",
      backend: "prescanner",
      trials: 5,
      startSeed: 11,
      elapsedMs: 1880,
      llmEnabled: false,
      strict: true,
      suggestApproval: false,
      approvalPath: "/repo/approval.json",
      visualDetected: 3,
      computedDetected: 1,
      hoverDetected: 1,
      paintTreeDetected: 3,
      a11yDetected: 0,
      eitherDetected: 5,
      neitherDetected: 0,
      prescanner: {
        total: 5,
        detected: 5,
        craterResolved: 3,
        chromiumFallbacks: 2,
        chromiumDetected: 2,
        passedAfterFallback: 0,
      },
    });

    assert.equal(record.avgMsPerTrial, 376);
    assert.equal(record.detectionRate, 1);
    assert.equal(record.prescanner?.craterResolved, 3);
  });
});

describe("bench-history round trip", () => {
  it("appends and reads jsonl records", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-history-"));
    const historyPath = join(dir, "bench-history.jsonl");
    try {
      await appendBenchHistory([
        makeRecord({ backend: "chromium" }),
        makeRecord({ backend: "prescanner", prescanner: { total: 10, detected: 9, craterResolved: 4, chromiumFallbacks: 6, chromiumDetected: 5, passedAfterFallback: 1 } }),
      ], historyPath);

      const loaded = await readBenchHistory(historyPath);
      assert.equal(loaded.length, 2);
      assert.equal(loaded[0].backend, "chromium");
      assert.equal(loaded[1].backend, "prescanner");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("getBenchHistoryStats", () => {
  it("summarizes latest by backend and comparable speedups", () => {
    const stats = getBenchHistoryStats([
      makeRecord({
        runId: "2026-04-01T00:00:00.000Z",
        backend: "chromium",
        elapsedMs: 9366,
        avgMsPerTrial: 624.4,
        trials: 15,
        startSeed: 1,
      }),
      makeRecord({
        runId: "2026-04-01T00:05:00.000Z",
        backend: "prescanner",
        elapsedMs: 5638,
        avgMsPerTrial: 375.8667,
        trials: 15,
        startSeed: 1,
        prescanner: { total: 15, detected: 15, craterResolved: 7, chromiumFallbacks: 8, chromiumDetected: 8, passedAfterFallback: 0 },
      }),
      makeRecord({
        runId: "2026-04-02T00:00:00.000Z",
        backend: "chromium",
        fixture: "dashboard",
        elapsedMs: 7000,
        avgMsPerTrial: 700,
      }),
    ]);

    assert.equal(stats.totalRuns, 3);
    assert.equal(stats.byBackend.get("chromium")?.count, 2);
    assert.equal(stats.byBackend.get("prescanner")?.latest.avgMsPerTrial, 375.8667);
    assert.equal(stats.comparableSpeedups.length, 1);
    assert.equal(stats.comparableSpeedups[0]?.fixture, "page");
    assert.equal(stats.comparableSpeedups[0]?.trials, 15);
    assert.equal(stats.comparableSpeedups[0]?.speedup.toFixed(2), "1.66");
  });
});
