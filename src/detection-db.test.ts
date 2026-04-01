import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { appendRecords, readAllRecords, getDbStats, type DetectionRecord } from "./detection-db.ts";

function makeRecord(overrides: Partial<DetectionRecord> = {}): DetectionRecord {
  return {
    runId: "2026-04-01T00:00:00.000Z",
    fixture: "page",
    backend: "chromium",
    selector: ".header",
    property: "padding",
    value: "12px 24px",
    category: "spacing",
    selectorType: "class",
    isInteractive: false,
    mediaCondition: null,
    viewports: [{ width: 1280, height: 900, visualDiffDetected: true, visualDiffRatio: 0.05, a11yDiffDetected: false, a11yChangeCount: 0 }],
    detected: true,
    undetectedReason: null,
    ...overrides,
  };
}

describe("detection-db", () => {
  it("should round-trip append and read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "detection-db-"));
    const dbPath = join(dir, "test.jsonl");
    try {
      const records = [makeRecord(), makeRecord({ selector: ".footer" })];
      await appendRecords(records, dbPath);
      const loaded = await readAllRecords(dbPath);
      assert.equal(loaded.length, 2);
      assert.equal(loaded[0].selector, ".header");
      assert.equal(loaded[1].selector, ".footer");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("should append to existing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "detection-db-"));
    const dbPath = join(dir, "test.jsonl");
    try {
      await appendRecords([makeRecord({ selector: ".a" })], dbPath);
      await appendRecords([makeRecord({ selector: ".b" })], dbPath);
      const loaded = await readAllRecords(dbPath);
      assert.equal(loaded.length, 2);
      assert.equal(loaded[0].selector, ".a");
      assert.equal(loaded[1].selector, ".b");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("should return empty array for missing file", async () => {
    const loaded = await readAllRecords("/tmp/nonexistent-detection-db-test.jsonl");
    assert.deepEqual(loaded, []);
  });

  it("should skip malformed lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "detection-db-"));
    const dbPath = join(dir, "test.jsonl");
    try {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(dbPath, '{"selector":".a","detected":true}\nbad line\n{"selector":".b","detected":false}\n');
      const loaded = await readAllRecords(dbPath);
      assert.equal(loaded.length, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("getDbStats", () => {
  it("should compute basic stats", () => {
    const records = [
      makeRecord({ detected: true, category: "spacing" }),
      makeRecord({ detected: true, category: "layout" }),
      makeRecord({ detected: false, category: "visual", undetectedReason: "hover-only" }),
      makeRecord({ detected: false, category: "visual", undetectedReason: "hover-only", runId: "2026-04-02T00:00:00.000Z" }),
    ];
    const stats = getDbStats(records);
    assert.equal(stats.totalRecords, 4);
    assert.equal(stats.uniqueRuns, 2);
    assert.equal(stats.detectionRate, 0.5);
    assert.equal(stats.byCategory.get("spacing")?.detected, 1);
    assert.equal(stats.byCategory.get("visual")?.total, 2);
    assert.equal(stats.byCategory.get("visual")?.detected, 0);
    assert.equal(stats.byReason.get("hover-only"), 2);
  });

  it("should handle empty records", () => {
    const stats = getDbStats([]);
    assert.equal(stats.totalRecords, 0);
    assert.equal(stats.detectionRate, 0);
    assert.equal(stats.dateRange, null);
  });
});
