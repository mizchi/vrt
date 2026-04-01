/**
 * 検出パターンデータベース
 *
 * JSONL 形式 (1行1レコード) で data/detection-patterns.jsonl に追記。
 */
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { PropertyCategory } from "./css-challenge-core.ts";
import type { SelectorType, UndetectedReason, ViewportDetectionResult } from "./detection-classify.ts";

// ---- Types ----

export interface DetectionRecord {
  runId: string;                // ISO timestamp of the bench run
  fixture: string;              // fixture name (e.g. "page", "dashboard")
  backend: string;              // "chromium" | "crater"
  selector: string;
  property: string;
  value: string;
  category: PropertyCategory;
  selectorType: SelectorType;
  isInteractive: boolean;
  mediaCondition: string | null;
  viewports: ViewportDetectionResult[];
  detected: boolean;            // true if ANY viewport detected
  undetectedReason: UndetectedReason | null;
}

// ---- Paths ----

export function getDbPath(): string {
  return join(import.meta.dirname!, "..", "data", "detection-patterns.jsonl");
}

// ---- Read / Write ----

export async function appendRecords(records: DetectionRecord[], dbPath?: string): Promise<void> {
  const path = dbPath ?? getDbPath();
  await mkdir(dirname(path), { recursive: true });
  const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  await appendFile(path, lines, "utf-8");
}

export async function readAllRecords(dbPath?: string): Promise<DetectionRecord[]> {
  const path = dbPath ?? getDbPath();
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return [];
  }
  const records: DetectionRecord[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return records;
}

// ---- Stats ----

export interface DbStats {
  totalRecords: number;
  uniqueRuns: number;
  dateRange: { first: string; last: string } | null;
  detectionRate: number;
  byCategory: Map<string, { total: number; detected: number }>;
  bySelectorType: Map<string, { total: number; detected: number }>;
  byReason: Map<string, number>;
}

export function getDbStats(records: DetectionRecord[]): DbStats {
  const runs = new Set(records.map((r) => r.runId));
  const sortedRuns = [...runs].sort();

  const byCategory = new Map<string, { total: number; detected: number }>();
  const bySelectorType = new Map<string, { total: number; detected: number }>();
  const byReason = new Map<string, number>();
  let detected = 0;

  for (const r of records) {
    if (r.detected) detected++;

    // Category
    const cat = byCategory.get(r.category) ?? { total: 0, detected: 0 };
    cat.total++;
    if (r.detected) cat.detected++;
    byCategory.set(r.category, cat);

    // Selector type
    const sel = bySelectorType.get(r.selectorType) ?? { total: 0, detected: 0 };
    sel.total++;
    if (r.detected) sel.detected++;
    bySelectorType.set(r.selectorType, sel);

    // Undetected reason
    if (!r.detected && r.undetectedReason) {
      byReason.set(r.undetectedReason, (byReason.get(r.undetectedReason) ?? 0) + 1);
    }
  }

  return {
    totalRecords: records.length,
    uniqueRuns: runs.size,
    dateRange: sortedRuns.length > 0 ? { first: sortedRuns[0], last: sortedRuns[sortedRuns.length - 1] } : null,
    detectionRate: records.length > 0 ? detected / records.length : 0,
    byCategory,
    bySelectorType,
    byReason,
  };
}
