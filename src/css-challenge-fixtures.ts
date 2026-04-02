import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const CSS_CHALLENGE_FIXTURE_DIR = join(import.meta.dirname!, "..", "fixtures", "css-challenge");
export const CSS_BENCH_OUTPUT_ROOT = join(import.meta.dirname!, "..", "test-results", "css-bench");

export async function listCssChallengeFixtureNames(
  fixtureDir = CSS_CHALLENGE_FIXTURE_DIR,
): Promise<string[]> {
  const entries = await readdir(fixtureDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name.slice(0, -".html".length))
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeCssChallengeFixtureSelection(
  requestedFixtures: string[],
  availableFixtures: string[],
): string[] {
  if (requestedFixtures.length === 0) return ["page"];
  if (requestedFixtures.includes("all")) return availableFixtures;

  const selectedFixtures = [...new Set(requestedFixtures)];
  const missingFixtures = selectedFixtures.filter((fixture) => !availableFixtures.includes(fixture));
  if (missingFixtures.length > 0) {
    throw new Error(
      `Unknown css-challenge fixture: ${missingFixtures.join(", ")}. Available: ${availableFixtures.join(", ")}`,
    );
  }
  return selectedFixtures;
}

export function getCssChallengeFixturePath(
  fixtureName: string,
  fixtureDir = CSS_CHALLENGE_FIXTURE_DIR,
): string {
  return join(fixtureDir, `${fixtureName}.html`);
}

export function getCssBenchFixtureOutputDir(
  fixtureName: string,
  outputRoot = CSS_BENCH_OUTPUT_ROOT,
): string {
  return join(outputRoot, fixtureName);
}

export function getCssBenchApprovalSuggestionsPath(
  fixtureName: string,
  outputRoot = CSS_BENCH_OUTPUT_ROOT,
): string {
  return join(getCssBenchFixtureOutputDir(fixtureName, outputRoot), "approval-suggestions.json");
}
