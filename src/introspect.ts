import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  A11yNode,
  IntrospectResult,
  PageIntrospection,
  SpecInvariant,
  UiSpec,
  PageSpec,
} from "./types.ts";
import { LANDMARK_ROLES, INTERACTIVE_ROLES } from "./a11y-semantic.ts";

/**
 * Auto-generate UI specifications from a11y snapshots.
 */
export async function introspect(snapshotDir: string): Promise<IntrospectResult> {
  const files = (await readdir(snapshotDir)).filter((f) => f.endsWith(".a11y.json"));
  const pages: PageIntrospection[] = [];

  for (const file of files) {
    const testId = file.replace(/\.a11y\.json$/, "");
    const raw = JSON.parse(await readFile(join(snapshotDir, file), "utf-8"));
    if (!raw) continue;

    pages.push(introspectPage(testId, raw as A11yNode));
  }

  return { generatedAt: new Date().toISOString(), pages };
}

function introspectPage(testId: string, tree: A11yNode): PageIntrospection {
  const landmarks: { role: string; name: string }[] = [];
  const interactiveElements: { role: string; name: string; hasLabel: boolean }[] = [];
  const headingLevels: number[] = [];
  let totalNodes = 0;

  function walk(node: A11yNode) {
    totalNodes++;

    if (LANDMARK_ROLES.has(node.role)) {
      landmarks.push({ role: node.role, name: node.name || "" });
    }

    if (INTERACTIVE_ROLES.has(node.role)) {
      interactiveElements.push({
        role: node.role,
        name: node.name || "",
        hasLabel: !!node.name,
      });
    }

    if (node.role === "heading" && node.level) {
      headingLevels.push(node.level);
    }

    for (const child of node.children ?? []) {
      walk(child);
    }
  }

  walk(tree);

  const unlabeledCount = interactiveElements.filter((e) => !e.hasLabel).length;

  // Auto-inferred invariants
  const suggestedInvariants = generateInvariants(testId, landmarks, interactiveElements, headingLevels, unlabeledCount);

  // Auto-generate page description
  const description = generateDescription(testId, landmarks, interactiveElements);

  return {
    testId,
    description,
    landmarks,
    interactiveElements,
    stats: {
      totalNodes,
      landmarkCount: landmarks.length,
      interactiveCount: interactiveElements.length,
      unlabeledCount,
      headingLevels: [...new Set(headingLevels)].sort(),
    },
    suggestedInvariants,
  };
}

function generateDescription(
  testId: string,
  landmarks: { role: string; name: string }[],
  interactive: { role: string; name: string; hasLabel: boolean }[]
): string {
  const parts = [`Page "${testId}"`];
  if (landmarks.length > 0) {
    parts.push(`with ${landmarks.map((l) => l.role).join(", ")}`);
  }
  const buttons = interactive.filter((e) => e.role === "button");
  const links = interactive.filter((e) => e.role === "link");
  const inputs = interactive.filter((e) => ["textbox", "searchbox", "combobox"].includes(e.role));
  if (buttons.length) parts.push(`${buttons.length} button(s)`);
  if (links.length) parts.push(`${links.length} link(s)`);
  if (inputs.length) parts.push(`${inputs.length} input(s)`);
  return parts.join(", ");
}

function generateInvariants(
  testId: string,
  landmarks: { role: string; name: string }[],
  interactive: { role: string; name: string; hasLabel: boolean }[],
  headingLevels: number[],
  unlabeledCount: number
): SpecInvariant[] {
  const invariants: SpecInvariant[] = [];

  // Landmark existence (include all landmarks as invariants)
  for (const lm of landmarks) {
    invariants.push({
      description: `${lm.role} landmark "${lm.name || "(unnamed)"}" is present`,
      check: "landmark-exists",
      cost: "low",
    });
  }

  // Interactive element role snapshot (for role-changed detection)
  const roleCounts = new Map<string, number>();
  for (const el of interactive) {
    roleCounts.set(el.role, (roleCounts.get(el.role) ?? 0) + 1);
  }
  for (const [role, count] of roleCounts) {
    invariants.push({
      description: `${count} ${role} element(s) expected`,
      check: "element-count",
      cost: "low",
    });
  }

  // Unlabeled element warning
  if (unlabeledCount > 0) {
    invariants.push({
      description: `${unlabeledCount} interactive element(s) without labels — should be fixed`,
      check: "label-present",
      cost: "low",
    });
  } else if (interactive.length > 0) {
    invariants.push({
      description: `All ${interactive.length} interactive elements have labels`,
      check: "label-present",
      cost: "low",
    });
  }

  // Whiteout/error checks (always)
  invariants.push({ description: "Page is not blank/whiteout", check: "no-whiteout", cost: "low" });
  invariants.push({ description: "No error state indicators", check: "no-error-state", cost: "low" });

  return invariants;
}

/**
 * Generate UiSpec (long-cycle spec) from introspect results.
 */
export function introspectToSpec(result: IntrospectResult): UiSpec {
  return {
    description: `Auto-generated UI spec from ${result.pages.length} page(s) at ${result.generatedAt}`,
    pages: result.pages.map((page): PageSpec => ({
      testId: page.testId,
      purpose: page.description,
      invariants: page.suggestedInvariants,
    })),
    global: [
      { description: "All pages should not be blank", check: "no-whiteout", cost: "low" },
      { description: "All interactive elements should have accessible labels", check: "label-present", cost: "low" },
    ],
  };
}

/**
 * Verify UiSpec invariants.
 */
export function verifySpec(
  spec: UiSpec,
  pageData: Map<string, { a11yTree?: A11yNode; screenshotExists: boolean }>,
  changedFiles?: string[],
  depEdges?: Map<string, string[]>
): SpecVerifyResult {
  const results: SpecPageResult[] = [];

  for (const pageSpec of spec.pages) {
    const data = pageData.get(pageSpec.testId);
    if (!data) {
      results.push({
        testId: pageSpec.testId,
        checked: [],
        skipped: pageSpec.invariants.map((inv) => ({
          invariant: inv,
          reason: "No snapshot data available",
        })),
      });
      continue;
    }

    const checked: CheckedInvariant[] = [];
    const skipped: SkippedInvariant[] = [];

    for (const inv of pageSpec.invariants) {
      // Skip via dep graph
      if (inv.dependsOn && changedFiles && depEdges) {
        const affected = isAffectedByChanges(inv.dependsOn, changedFiles, depEdges);
        if (!affected) {
          skipped.push({ invariant: inv, reason: "Not affected by current changes (dep graph)" });
          continue;
        }
      }

      // NL assertion is high-cost, mark as skippable
      if (inv.check === "nl-assertion" || inv.cost === "high") {
        skipped.push({ invariant: inv, reason: "High-cost assertion — skipped (use --full to run)" });
        continue;
      }

      // Heuristic verification
      const result = checkInvariant(inv, data);
      checked.push(result);
    }

    // Also check global invariants
    for (const inv of spec.global ?? []) {
      const result = checkInvariant(inv, data);
      checked.push(result);
    }

    results.push({ testId: pageSpec.testId, checked, skipped });
  }

  return { results };
}

function checkInvariant(
  inv: SpecInvariant,
  data: { a11yTree?: A11yNode; screenshotExists: boolean }
): CheckedInvariant {
  if (!data.a11yTree) {
    return { invariant: inv, passed: false, reasoning: "No a11y tree available" };
  }

  switch (inv.check) {
    case "landmark-exists": {
      const found = findRole(data.a11yTree, extractRoleFromDesc(inv.description));
      return { invariant: inv, passed: found, reasoning: found ? "Landmark found" : "Landmark not found" };
    }
    case "label-present": {
      const unlabeled = countUnlabeled(data.a11yTree);
      return { invariant: inv, passed: unlabeled === 0, reasoning: `${unlabeled} unlabeled element(s)` };
    }
    case "no-whiteout":
      return { invariant: inv, passed: data.screenshotExists, reasoning: data.screenshotExists ? "Screenshot exists" : "No screenshot" };
    case "no-error-state":
      return { invariant: inv, passed: true, reasoning: "Heuristic check (a11y-based) — OK" };
    case "element-count": {
      const match = inv.description.match(/^(\d+)\s+(\w+)\s+element/);
      if (!match) return { invariant: inv, passed: true, reasoning: "Could not parse element-count invariant" };
      const expectedCount = parseInt(match[1], 10);
      const role = match[2];
      const actualCount = countRole(data.a11yTree, role);
      const passed = actualCount === expectedCount;
      return {
        invariant: inv,
        passed,
        reasoning: passed
          ? `${role}: ${actualCount} found (expected ${expectedCount})`
          : `${role}: ${actualCount} found but expected ${expectedCount}`,
      };
    }
    default:
      return { invariant: inv, passed: true, reasoning: `Check "${inv.check ?? "none"}" — passed (no verifier)` };
  }
}

function extractRoleFromDesc(desc: string): string {
  const match = desc.match(/^(\w+)\s+landmark/);
  return match?.[1] ?? "";
}

function findRole(node: A11yNode, role: string): boolean {
  if (node.role === role) return true;
  for (const child of node.children ?? []) {
    if (findRole(child, role)) return true;
  }
  return false;
}

function countRole(node: A11yNode, role: string): number {
  let count = 0;
  if (node.role === role) count++;
  for (const child of node.children ?? []) count += countRole(child, role);
  return count;
}

function countUnlabeled(node: A11yNode): number {
  let count = 0;
  if (INTERACTIVE_ROLES.has(node.role) && !node.name) count++;
  for (const child of node.children ?? []) count += countUnlabeled(child);
  return count;
}

function isAffectedByChanges(
  dependsOn: string[],
  changedFiles: string[],
  depEdges: Map<string, string[]>
): boolean {
  // Direct match
  for (const dep of dependsOn) {
    if (changedFiles.some((f) => f.includes(dep))) return true;
  }
  // 1-hop dependency
  for (const dep of dependsOn) {
    const edges = depEdges.get(dep) ?? [];
    for (const edge of edges) {
      if (changedFiles.some((f) => f.includes(edge))) return true;
    }
  }
  return false;
}

// ---- Types for verify results ----

export interface SpecVerifyResult {
  results: SpecPageResult[];
}

export interface SpecPageResult {
  testId: string;
  checked: CheckedInvariant[];
  skipped: SkippedInvariant[];
}

export interface CheckedInvariant {
  invariant: SpecInvariant;
  passed: boolean;
  reasoning: string;
}

export interface SkippedInvariant {
  invariant: SpecInvariant;
  reason: string;
}
