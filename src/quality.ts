import type {
  QualityCheckResult,
  VrtSnapshot,
  VrtDiff,
  DepGraph,
  AffectedComponent,
} from "./types.ts";
import { detectWhiteout, detectEmptyContent } from "./heatmap.ts";
import { decodePng } from "./png-utils.ts";

/**
 * Run all quality checks.
 */
export async function runQualityChecks(
  snapshots: VrtSnapshot[],
  diffs: VrtDiff[],
  graph?: DepGraph,
  affected?: AffectedComponent[]
): Promise<QualityCheckResult[]> {
  const results: QualityCheckResult[] = [];

  // Per-snapshot checks
  for (const snapshot of snapshots) {
    const snapshotChecks = await checkSnapshot(snapshot);
    results.push(...snapshotChecks);
  }

  // Coverage check
  if (graph && affected) {
    results.push(checkCoverage(snapshots, affected));
  }

  // Error state check (when diff exists)
  for (const diff of diffs) {
    if (diff.diffRatio > 0.5) {
      results.push({
        check: "layout-shift",
        passed: false,
        details: `Large visual change detected in "${diff.snapshot.testTitle}": ${(diff.diffRatio * 100).toFixed(1)}% of pixels changed. ${diff.regions.length} region(s) affected.`,
        severity: "warning",
      });
    }
  }

  return results;
}

/**
 * Per-snapshot quality checks.
 */
async function checkSnapshot(
  snapshot: VrtSnapshot
): Promise<QualityCheckResult[]> {
  const results: QualityCheckResult[] = [];

  try {
    const png = await decodePng(snapshot.screenshotPath);

    // Whiteout detection
    const whiteout = detectWhiteout(png);
    results.push({
      check: "whiteout",
      passed: !whiteout.isWhiteout,
      details: whiteout.isWhiteout
        ? `Whiteout detected in "${snapshot.testTitle}": ${(whiteout.whiteRatio * 100).toFixed(1)}% white pixels`
        : `OK: ${(whiteout.whiteRatio * 100).toFixed(1)}% white pixels`,
      severity: whiteout.isWhiteout ? "error" : "info",
    });

    // Empty content detection
    const empty = detectEmptyContent(png);
    results.push({
      check: "empty-content",
      passed: !empty.isEmpty,
      details: empty.isEmpty
        ? `Empty content detected in "${snapshot.testTitle}": only ${empty.uniqueColors} unique colors`
        : `OK: ${empty.uniqueColors} unique colors`,
      severity: empty.isEmpty ? "error" : "info",
    });

    // Error state detection (red pixel ratio)
    const errorState = detectErrorIndicators(png);
    results.push({
      check: "error-state",
      passed: !errorState.hasError,
      details: errorState.hasError
        ? `Possible error state in "${snapshot.testTitle}": ${errorState.reason}`
        : "OK: no error indicators detected",
      severity: errorState.hasError ? "warning" : "info",
    });
  } catch (err) {
    results.push({
      check: "whiteout",
      passed: false,
      details: `Failed to analyze screenshot "${snapshot.testTitle}": ${err}`,
      severity: "error",
    });
  }

  return results;
}

/**
 * Detect visual indicators of error states.
 * - High red pixel ratio (error messages, validation errors)
 * - Yellow/orange warning colors
 */
function detectErrorIndicators(data: {
  width: number;
  height: number;
  data: Uint8Array;
}): { hasError: boolean; reason: string } {
  const { width, height, data: pixels } = data;
  const total = width * height;
  let redCount = 0;
  let yellowCount = 0;

  const stride = Math.max(1, Math.floor(total / 20000));
  let sampled = 0;

  for (let i = 0; i < total; i += stride) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    sampled++;

    // Red (error): high R, low G, low B
    if (r > 180 && g < 80 && b < 80) {
      redCount++;
    }
    // Yellow/orange (warning): high R, mid-high G, low B
    if (r > 200 && g > 120 && g < 220 && b < 60) {
      yellowCount++;
    }
  }

  const redRatio = redCount / sampled;
  const yellowRatio = yellowCount / sampled;

  if (redRatio > 0.05) {
    return {
      hasError: true,
      reason: `${(redRatio * 100).toFixed(1)}% red pixels (possible error state)`,
    };
  }
  if (yellowRatio > 0.1) {
    return {
      hasError: true,
      reason: `${(yellowRatio * 100).toFixed(1)}% yellow/orange pixels (possible warning state)`,
    };
  }

  return { hasError: false, reason: "" };
}

/**
 * VRT coverage: ratio of affected components that have VRT snapshots.
 */
function checkCoverage(
  snapshots: VrtSnapshot[],
  affected: AffectedComponent[]
): QualityCheckResult {
  if (affected.length === 0) {
    return {
      check: "coverage",
      passed: true,
      details: "No affected components to cover",
      severity: "info",
    };
  }

  // Check if snapshot testTitle/testId contains the component name
  const snapshotNames = new Set(
    snapshots.flatMap((s) => [s.testTitle.toLowerCase(), s.testId.toLowerCase()])
  );

  const covered: string[] = [];
  const uncovered: string[] = [];

  for (const comp of affected) {
    // Match by component filename (without extension)
    const name = comp.node.id
      .replace(/\.[^.]+$/, "")
      .split("/")
      .pop()!
      .toLowerCase();

    const isCovered = [...snapshotNames].some(
      (sn) => sn.includes(name) || name.includes(sn)
    );

    if (isCovered) {
      covered.push(comp.node.id);
    } else {
      uncovered.push(comp.node.id);
    }
  }

  const ratio = covered.length / affected.length;
  const passed = ratio >= 0.8; // 80% coverage threshold

  return {
    check: "coverage",
    passed,
    details: `VRT coverage: ${covered.length}/${affected.length} (${(ratio * 100).toFixed(0)}%) affected components covered.${uncovered.length > 0 ? ` Uncovered: ${uncovered.join(", ")}` : ""}`,
    severity: passed ? "info" : "warning",
  };
}
