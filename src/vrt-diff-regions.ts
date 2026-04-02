import type { DiffRegion, VrtDiff } from "./types.ts";

export function normalizeVrtDiffRegions(diff: VrtDiff): DiffRegion[] {
  const normalizedPixels = normalizeVrtDiffRegionPixels(diff);
  return diff.regions.map((region, index) => ({
    ...region,
    diffPixelCount: normalizedPixels[index] ?? 0,
  }));
}

export function normalizeVrtDiffRegionPixels(diff: VrtDiff): number[] {
  if (diff.regions.length === 0) return [];

  const target = Math.max(0, Math.round(diff.diffPixels));
  const rawWeights = diff.regions.map((region) => Math.max(0, Math.round(region.diffPixelCount)));
  const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);

  if (target === 0) {
    return rawWeights.map(() => 0);
  }

  if (totalWeight === target) {
    return rawWeights;
  }

  if (totalWeight === 0) {
    return distributeEvenly(target, diff.regions.length);
  }

  const exactShares = rawWeights.map((weight) => (target * weight) / totalWeight);
  const normalized = exactShares.map((share) => Math.floor(share));
  let remainder = target - normalized.reduce((sum, value) => sum + value, 0);

  const byFraction = exactShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const entry of byFraction) {
    if (remainder <= 0) break;
    normalized[entry.index]++;
    remainder--;
  }

  return normalized;
}

export function createScopedVrtDiff(
  diff: VrtDiff,
  region: DiffRegion,
): VrtDiff {
  return {
    ...diff,
    diffPixels: region.diffPixelCount,
    diffRatio: region.diffPixelCount / Math.max(diff.totalPixels, 1),
    regions: [region],
    heatmapPath: undefined,
  };
}

function distributeEvenly(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    if (remainder > 0) {
      remainder--;
      return base + 1;
    }
    return base;
  });
}
