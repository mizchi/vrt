import { classifyVisualDiff } from "./visual-semantic.ts";
import type { ApprovalChangeType } from "./approval.ts";
import type { PropertyCategory } from "./css-challenge-core.ts";
import type { VisualSemanticChange, VrtDiff } from "./types.ts";
import { createScopedVrtDiff, normalizeVrtDiffRegions } from "./vrt-diff-regions.ts";

export type MigrationDiffCategory =
  | "layout-shift"
  | "color-change"
  | "spacing"
  | "typography"
  | "other";

export interface MigrationDiffClassification {
  dominantCategory: MigrationDiffCategory | "none";
  counts: Record<MigrationDiffCategory, number>;
  summary: string;
}

export interface MigrationRegionApprovalContext {
  migrationCategory: MigrationDiffCategory;
  category: PropertyCategory;
  changeType: ApprovalChangeType;
}

const MIGRATION_DIFF_CATEGORIES: MigrationDiffCategory[] = [
  "layout-shift",
  "color-change",
  "spacing",
  "typography",
  "other",
];

export function classifyMigrationVisualChange(
  change: VisualSemanticChange,
  diff: VrtDiff,
): MigrationDiffCategory {
  switch (change.type) {
    case "text-change":
      return "typography";
    case "color-change":
    case "icon-change":
      return "color-change";
    case "layout-shift":
      return isSpacingLikeChange(change, diff) ? "spacing" : "layout-shift";
    case "element-added":
    case "element-removed":
      return "layout-shift";
    default:
      return "other";
  }
}

export function classifyMigrationDiff(
  diff: VrtDiff | null,
): MigrationDiffClassification {
  const counts = createCategoryCounts();
  const weights = createCategoryCounts();
  if (!diff || diff.diffPixels === 0) {
    return {
      dominantCategory: "none",
      counts,
      summary: "no changes",
    };
  }

  const semantic = classifyVisualDiff(normalizeMigrationDiff(diff));
  for (const change of semantic.changes) {
    const category = classifyMigrationVisualChange(change, diff);
    counts[category]++;
    weights[category] += change.region.diffPixelCount;
  }

  const nonZeroEntries = MIGRATION_DIFF_CATEGORIES
    .map((category) => [category, counts[category]] as const)
    .filter((entry) => entry[1] > 0);

  if (nonZeroEntries.length === 0) {
    return {
      dominantCategory: "none",
      counts,
      summary: "no changes",
    };
  }

  const [dominantCategory] = nonZeroEntries.reduce((current, candidate) => {
    if (weights[candidate[0]] > weights[current[0]]) return candidate;
    if (weights[candidate[0]] === weights[current[0]] && candidate[1] > current[1]) return candidate;
    return current;
  });

  const summary = nonZeroEntries
    .map(([category, count]) => `${count} ${category}`)
    .join(", ");

  return {
    dominantCategory,
    counts,
    summary,
  };
}

export function buildMigrationRegionApprovalContexts(
  diff: VrtDiff,
): MigrationRegionApprovalContext[] {
  const normalizedDiff = normalizeMigrationDiff(diff);
  return normalizedDiff.regions.map((region) => {
    const regionDiff = createScopedVrtDiff(normalizedDiff, region);
    const change = classifyVisualDiff(regionDiff).changes[0];
    const migrationCategory = change ? classifyMigrationVisualChange(change, regionDiff) : "other";
    return {
      migrationCategory,
      category: toApprovalCategory(migrationCategory),
      changeType: toApprovalChangeType(migrationCategory),
    };
  });
}

function createCategoryCounts(): Record<MigrationDiffCategory, number> {
  return {
    "layout-shift": 0,
    "color-change": 0,
    spacing: 0,
    typography: 0,
    other: 0,
  };
}

function isSpacingLikeChange(
  change: VisualSemanticChange,
  diff: VrtDiff,
): boolean {
  const shortEdge = Math.min(change.region.width, change.region.height);
  const longEdge = Math.max(change.region.width, change.region.height);
  const globalRatio = change.region.diffPixelCount / Math.max(diff.totalPixels, 1);
  return shortEdge <= 96 && longEdge <= 512 && globalRatio <= 0.12;
}

function normalizeMigrationDiff(diff: VrtDiff): VrtDiff {
  return {
    ...diff,
    regions: normalizeVrtDiffRegions(diff),
  };
}

function toApprovalCategory(category: MigrationDiffCategory): PropertyCategory {
  switch (category) {
    case "layout-shift":
      return "layout";
    case "color-change":
      return "visual";
    case "spacing":
      return "spacing";
    case "typography":
      return "typography";
    default:
      return "other";
  }
}

function toApprovalChangeType(category: MigrationDiffCategory): ApprovalChangeType {
  switch (category) {
    case "layout-shift":
    case "spacing":
      return "geometry";
    case "typography":
      return "text";
    default:
      return "paint";
  }
}
