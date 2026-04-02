import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendApprovalHistory,
  buildApprovalHistoryEntry,
  getDefaultApprovalHistoryPath,
} from "./approval-history.ts";

describe("getDefaultApprovalHistoryPath", () => {
  it("should place the history file next to approval.json", () => {
    const path = getDefaultApprovalHistoryPath("/repo/approval.json");
    assert.equal(path, "/repo/approval-history.jsonl");
  });
});

describe("buildApprovalHistoryEntry", () => {
  it("should capture actor, timestamp, and approved rule", () => {
    const entry = buildApprovalHistoryEntry({
      actor: "mz",
      action: "approve",
      sourcePath: "/repo/test-results/css-bench/approval-suggestions.json",
      outputPath: "/repo/approval.json",
      finalRule: {
        selector: ".card",
        property: "margin-left",
        category: "spacing",
        changeType: "geometry",
        tolerance: { geometryDelta: 4 },
        reason: "known drift",
      },
      actedAt: "2026-04-02T12:00:00.000Z",
    });

    assert.equal(entry.actor, "mz");
    assert.equal(entry.action, "approve");
    assert.equal(entry.actedAt, "2026-04-02T12:00:00.000Z");
    assert.equal(entry.finalRule?.reason, "known drift");
  });
});

describe("appendApprovalHistory", () => {
  it("should append jsonl entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "approval-history-"));
    const historyPath = join(dir, "approval-history.jsonl");

    await appendApprovalHistory(
      [
        buildApprovalHistoryEntry({
          actor: "mz",
          action: "approve",
          sourcePath: "/repo/test-results/css-bench/approval-suggestions.json",
          outputPath: "/repo/approval.json",
          finalRule: {
            selector: ".card",
            property: "margin-left",
            category: "spacing",
            changeType: "geometry",
            tolerance: { geometryDelta: 4 },
            reason: "known drift",
          },
          actedAt: "2026-04-02T12:00:00.000Z",
        }),
      ],
      historyPath,
    );

    const content = await readFile(historyPath, "utf-8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.actor, "mz");
    assert.equal(parsed.finalRule.reason, "known drift");
  });
});
