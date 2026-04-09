import { copyFile, readFile } from "node:fs/promises";

export interface SnapshotApproveEntry {
  label: string;
  viewport: string;
  currentPath: string;
  baselinePath: string;
}

export interface SnapshotApproveResult {
  updated: number;
  labels: string[];
  entries: SnapshotApproveEntry[];
}

interface SnapshotReportEntry {
  label: string;
  viewport: string;
  screenshotPath: string;
  baselinePath?: string;
}

interface SnapshotReportFile {
  results: SnapshotReportEntry[];
}

function deriveBaselinePath(currentPath: string): string {
  if (!currentPath.endsWith("-current.png")) {
    throw new Error(`Expected snapshot current PNG path, got: ${currentPath}`);
  }
  return currentPath.replace(/-current\.png$/u, "-baseline.png");
}

function resolveApproveEntries(
  report: SnapshotReportFile,
  labelFilters: string[],
): SnapshotApproveEntry[] {
  const normalizedFilters = [...new Set(labelFilters)];
  const results = normalizedFilters.length === 0
    ? report.results
    : report.results.filter((entry) => normalizedFilters.includes(entry.label));

  if (normalizedFilters.length > 0 && results.length === 0) {
    throw new Error(`No snapshot results matched --label filters: ${normalizedFilters.join(", ")}`);
  }

  return results.map((entry) => ({
    label: entry.label,
    viewport: entry.viewport,
    currentPath: entry.screenshotPath,
    baselinePath: entry.baselinePath ?? deriveBaselinePath(entry.screenshotPath),
  }));
}

export async function approveSnapshotsFromReport(
  reportPath: string,
  labelFilters: string[],
): Promise<SnapshotApproveResult> {
  const raw = await readFile(reportPath, "utf-8");
  const report = JSON.parse(raw) as SnapshotReportFile;
  const entries = resolveApproveEntries(report, labelFilters);

  for (const entry of entries) {
    await copyFile(entry.currentPath, entry.baselinePath);
  }

  return {
    updated: entries.length,
    labels: [...new Set(entries.map((entry) => entry.label))],
    entries,
  };
}
