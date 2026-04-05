import type {
  VrtDiff,
  DiffRegion,
  VisualSemanticChange,
  VisualSemanticDiff,
  VisualChangeType,
} from "./types.ts";

/**
 * Convert VRT pixel diff into visual semantics.
 *
 * Analyzes each diff region to infer what changed:
 * - text-change: text area change (wide, small region)
 * - color-change: color-only change (same shape)
 * - layout-shift: element repositioning (large region, correlated diffs)
 * - element-added/removed: new/removed element
 * - icon-change: small square region
 */
export function classifyVisualDiff(diff: VrtDiff): VisualSemanticDiff {
  const changes: VisualSemanticChange[] = [];

  for (const region of diff.regions) {
    const classified = classifyRegion(region, diff);
    changes.push(classified);
  }

  // Group correlated layout-shifts
  const grouped = groupLayoutShifts(changes);

  return {
    testId: diff.snapshot.testId,
    changes: grouped,
    summary: summarizeChanges(grouped),
  };
}

function classifyRegion(
  region: DiffRegion,
  diff: VrtDiff
): VisualSemanticChange {
  const area = region.width * region.height;
  const aspectRatio = region.width / Math.max(region.height, 1);
  const density = region.diffPixelCount / area;
  const globalRatio = region.diffPixelCount / diff.totalPixels;

  // Small square -> icon change
  if (
    area < 4096 && // <= 64x64
    aspectRatio > 0.5 &&
    aspectRatio < 2.0
  ) {
    return {
      type: "icon-change",
      region,
      confidence: 0.7,
      description: `Small square region changed at (${region.x}, ${region.y})`,
    };
  }

  // Wide and sparse -> text change
  if (aspectRatio > 3.0 && density < 0.5) {
    return {
      type: "text-change",
      region,
      confidence: 0.6,
      description: `Text-like region changed at (${region.x}, ${region.y}), ${region.width}x${region.height}`,
    };
  }

  // High density, small-medium area -> color change
  if (density > 0.7 && area < diff.totalPixels * 0.3) {
    return {
      type: "color-change",
      region,
      confidence: 0.65,
      description: `Color change in region (${region.x}, ${region.y}), ${region.width}x${region.height}, ${(density * 100).toFixed(0)}% density`,
    };
  }

  // Large area -> layout shift
  if (globalRatio > 0.05) {
    return {
      type: "layout-shift",
      region,
      confidence: 0.5,
      description: `Layout shift at (${region.x}, ${region.y}), ${region.width}x${region.height}, ${(globalRatio * 100).toFixed(1)}% of total`,
    };
  }

  // New element (high density + medium size)
  if (density > 0.5 && area > 1024) {
    return {
      type: "element-added",
      region,
      confidence: 0.4,
      description: `New element appeared at (${region.x}, ${region.y}), ${region.width}x${region.height}`,
    };
  }

  // Default: element-added
  return {
    type: "element-added",
    region,
    confidence: 0.3,
    description: `Change at (${region.x}, ${region.y}), ${region.width}x${region.height}`,
  };
}

/**
 * Group layout-shifts with close Y coordinates.
 * Multiple regions shifting on the same row = one layout shift.
 */
function groupLayoutShifts(
  changes: VisualSemanticChange[]
): VisualSemanticChange[] {
  const layoutShifts = changes.filter((c) => c.type === "layout-shift");
  const others = changes.filter((c) => c.type !== "layout-shift");

  if (layoutShifts.length <= 1) return changes;

  // Sort by Y coordinate and group nearby ones
  layoutShifts.sort((a, b) => a.region.y - b.region.y);

  const groups: VisualSemanticChange[][] = [];
  let currentGroup: VisualSemanticChange[] = [layoutShifts[0]];

  for (let i = 1; i < layoutShifts.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = layoutShifts[i];
    // Within 64px Y distance -> same group
    if (Math.abs(curr.region.y - prev.region.y) < 64) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  // Merge each group into a single change
  const merged = groups.map((group): VisualSemanticChange => {
    if (group.length === 1) return group[0];

    const minX = Math.min(...group.map((c) => c.region.x));
    const minY = Math.min(...group.map((c) => c.region.y));
    const maxX = Math.max(
      ...group.map((c) => c.region.x + c.region.width)
    );
    const maxY = Math.max(
      ...group.map((c) => c.region.y + c.region.height)
    );
    const totalDiff = group.reduce(
      (sum, c) => sum + c.region.diffPixelCount,
      0
    );

    return {
      type: "layout-shift",
      region: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        diffPixelCount: totalDiff,
      },
      confidence: Math.max(...group.map((c) => c.confidence)),
      description: `Layout shift spanning ${group.length} regions at y=${minY}-${maxY}`,
    };
  });

  return [...others, ...merged];
}

function summarizeChanges(changes: VisualSemanticChange[]): string {
  const byType = new Map<VisualChangeType, number>();
  for (const c of changes) {
    byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [type, count] of byType) {
    parts.push(`${count} ${type}`);
  }
  return parts.join(", ") || "no changes";
}
