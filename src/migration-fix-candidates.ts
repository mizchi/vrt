import type { PaintTreeChange } from "./crater-client.ts";
import {
  categorizeProperty,
  extractCss,
  parseCssDeclarations,
  type PropertyCategory,
} from "./css-challenge-core.ts";
import type { MigrationDiffCategory } from "./migration-diff.ts";

export interface MigrationViewportFixSignal {
  viewportWidth: number;
  dominantCategory: MigrationDiffCategory | "none";
  categorySummary: string;
  paintTreeChanges: PaintTreeChange[];
}

export interface MigrationFixCandidate {
  selector: string;
  property: string;
  value: string;
  category: PropertyCategory;
  mediaCondition: string | null;
  score: number;
  reasoning: string;
}

export interface MigrationFixCandidateSummary extends MigrationFixCandidate {
  occurrences: number;
}

export function buildMigrationViewportFixCandidatesFromHtml(
  html: string,
  signal: MigrationViewportFixSignal,
  limit = 5,
): MigrationFixCandidate[] {
  const css = extractCss(html);
  if (!css || signal.dominantCategory === "none") return [];
  const declarations = parseCssDeclarations(css);
  const candidates = declarations
    .map((declaration) => scoreMigrationFixCandidate(declaration, signal))
    .filter((candidate): candidate is MigrationFixCandidate => candidate !== null)
    .sort(compareCandidates);

  return dedupeCandidates(candidates).slice(0, limit);
}

export function summarizeMigrationFixCandidates(
  groups: MigrationFixCandidate[][],
  limit = 10,
): MigrationFixCandidateSummary[] {
  const aggregated = new Map<string, MigrationFixCandidateSummary>();
  for (const group of groups) {
    for (const candidate of group) {
      const key = [
        candidate.selector,
        candidate.property,
        candidate.value,
        candidate.mediaCondition ?? "",
      ].join("\u0000");
      const existing = aggregated.get(key);
      if (existing) {
        existing.occurrences++;
        existing.score = Math.max(existing.score, candidate.score);
      } else {
        aggregated.set(key, { ...candidate, occurrences: 1 });
      }
    }
  }

  return [...aggregated.values()]
    .sort((left, right) => {
      if (right.occurrences !== left.occurrences) return right.occurrences - left.occurrences;
      if (right.score !== left.score) return right.score - left.score;
      return left.selector.localeCompare(right.selector);
    })
    .slice(0, limit);
}

function scoreMigrationFixCandidate(
  declaration: {
    selector: string;
    property: string;
    value: string;
    mediaCondition: string | null;
  },
  signal: MigrationViewportFixSignal,
): MigrationFixCandidate | null {
  const mediaMatch = matchesViewport(declaration.mediaCondition, signal.viewportWidth);
  if (mediaMatch === false) return null;

  const category = categorizeProperty(declaration.property);
  let score = signal.dominantCategory !== "none" ? categoryWeight(signal.dominantCategory, category) : 0;
  const reasons: string[] = [];
  if (score > 0) {
    reasons.push(`${signal.dominantCategory} mismatch`);
  }

  if (mediaMatch === true && declaration.mediaCondition) {
    score += 2;
    reasons.push(`active media ${declaration.mediaCondition}`);
    score += mediaSpecificityBonus(declaration.mediaCondition, signal.viewportWidth);
  }

  for (const change of signal.paintTreeChanges) {
    if (matchesPaintTreeProperty(declaration.property, change.property, change.type)) {
      score += 4;
      reasons.push(`paint tree ${change.type} ${change.property ?? "change"}`);
      break;
    }
  }

  if (score <= 0) return null;

  return {
    selector: declaration.selector,
    property: declaration.property,
    value: declaration.value,
    category,
    mediaCondition: declaration.mediaCondition,
    score,
    reasoning: reasons.join("; "),
  };
}

function compareCandidates(left: MigrationFixCandidate, right: MigrationFixCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  return left.selector.localeCompare(right.selector) || left.property.localeCompare(right.property);
}

function dedupeCandidates(candidates: MigrationFixCandidate[]): MigrationFixCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.selector}\u0000${candidate.property}\u0000${candidate.mediaCondition ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function categoryWeight(
  migrationCategory: MigrationDiffCategory,
  propertyCategory: PropertyCategory,
): number {
  switch (migrationCategory) {
    case "spacing":
      return propertyCategory === "spacing" ? 6 : propertyCategory === "layout" || propertyCategory === "sizing" ? 3 : 0;
    case "layout-shift":
      return propertyCategory === "layout" ? 5 : propertyCategory === "spacing" || propertyCategory === "sizing" ? 3 : 0;
    case "color-change":
      return propertyCategory === "visual" ? 6 : 0;
    case "typography":
      return propertyCategory === "typography" ? 6 : propertyCategory === "sizing" ? 2 : 0;
    default:
      return 0;
  }
}

function matchesViewport(mediaCondition: string | null, viewportWidth: number): boolean {
  if (!mediaCondition) return true;
  const minWidth = parseMediaWidth(mediaCondition, "min-width");
  if (minWidth !== null && viewportWidth < minWidth) return false;
  const maxWidth = parseMediaWidth(mediaCondition, "max-width");
  if (maxWidth !== null && viewportWidth > maxWidth) return false;
  return true;
}

function parseMediaWidth(mediaCondition: string, key: "min-width" | "max-width"): number | null {
  const match = mediaCondition.match(new RegExp(`\\(${key}:\\s*([\\d.]+)(px|rem)\\)`));
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  return match[2] === "rem" ? value * 16 : value;
}

function matchesPaintTreeProperty(
  property: string,
  paintTreeProperty: string | undefined,
  changeType: PaintTreeChange["type"],
): boolean {
  if (!paintTreeProperty) {
    return changeType === "geometry" && categoryWeight("layout-shift", categorizeProperty(property)) > 0;
  }
  if (property === paintTreeProperty) return true;
  if (paintTreeProperty === "background" && (property === "background" || property === "background-color")) return true;
  if (paintTreeProperty === "bounds") return categoryWeight("layout-shift", categorizeProperty(property)) > 0;
  if (paintTreeProperty === "color" && property === "color") return true;
  return false;
}

function mediaSpecificityBonus(mediaCondition: string, viewportWidth: number): number {
  const minWidth = parseMediaWidth(mediaCondition, "min-width");
  if (minWidth !== null && viewportWidth >= minWidth) {
    return minWidth / 10_000;
  }
  const maxWidth = parseMediaWidth(mediaCondition, "max-width");
  if (maxWidth !== null && viewportWidth <= maxWidth) {
    return (10_000 - maxWidth) / 10_000;
  }
  return 0;
}
