import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ApprovalDecision, ApprovalRule } from "./approval.ts";

export interface ApprovalHistoryEntry {
  actor: string;
  action: ApprovalDecision;
  actedAt: string;
  sourcePath?: string;
  outputPath?: string;
  finalRule?: ApprovalRule;
}

export interface ApprovalHistoryEntryInput {
  actor: string;
  action: ApprovalDecision;
  actedAt?: string;
  sourcePath?: string;
  outputPath?: string;
  finalRule?: ApprovalRule;
}

export function getDefaultApprovalHistoryPath(outputPath: string): string {
  return join(dirname(outputPath), "approval-history.jsonl");
}

export function buildApprovalHistoryEntry(
  input: ApprovalHistoryEntryInput,
): ApprovalHistoryEntry {
  return {
    actor: input.actor,
    action: input.action,
    actedAt: input.actedAt ?? new Date().toISOString(),
    sourcePath: input.sourcePath,
    outputPath: input.outputPath,
    finalRule: input.finalRule,
  };
}

export async function appendApprovalHistory(
  entries: ApprovalHistoryEntry[],
  historyPath: string,
): Promise<void> {
  if (entries.length === 0) return;
  await mkdir(dirname(historyPath), { recursive: true });
  const lines = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  await appendFile(historyPath, lines, "utf-8");
}
