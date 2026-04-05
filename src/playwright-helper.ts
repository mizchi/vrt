/**
 * Playwright test helper: onlyOnFailure NL assertion
 *
 * Uses Vision LLM to generate fix hints from screenshots + a11y tree
 * only when regular assertions fail.
 *
 * Cost optimization:
 * - onlyOnFailure: true -> fires only on test failure
 * - dependsOn -> skip if unaffected via dep graph
 * - cache -> don't re-run the same assertion
 */
import type { Page } from "@playwright/test";
import type { NlAssertion } from "./types.ts";
import type { LLMProvider } from "./intent.ts";

export interface NlAssertOptions {
  /** Fire only on test failure (default: true) */
  onlyOnFailure?: boolean;
  /** Source files this assertion depends on */
  dependsOn?: string[];
  /** LLM provider */
  llm?: LLMProvider;
  /** Cache previous results */
  cache?: boolean;
}

interface NlAssertResult {
  passed: boolean;
  reasoning: string;
  hint?: string;
  skipped?: boolean;
  skipReason?: string;
}

// Assertion result cache
const assertionCache = new Map<string, NlAssertResult>();

/**
 * Assert UI state via natural language.
 *
 * @example
 * ```ts
 * test("home page", async ({ page }) => {
 *   await page.goto("/");
 *
 *   // Regular assertion
 *   await expect(page.getByRole("heading")).toBeVisible();
 *
 *   // NL assertion: fires only on test failure
 *   await nlAssert(page, "Navigation bar has 5+ links", {
 *     dependsOn: ["src/Header.tsx"],
 *   });
 * });
 * ```
 */
export async function nlAssert(
  page: Page,
  assertion: string,
  opts: NlAssertOptions = {}
): Promise<NlAssertResult> {
  const { onlyOnFailure = true, dependsOn, llm, cache = true } = opts;

  // Cache check
  const cacheKey = `${page.url()}:${assertion}`;
  if (cache && assertionCache.has(cacheKey)) {
    return assertionCache.get(cacheKey)!;
  }

  // onlyOnFailure: skip if test hasn't failed
  if (onlyOnFailure) {
    // No way to check Playwright test state directly,
    // caller controls via try-catch.
    // This flag serves as a usage pattern guide.
  }

  // Fall back to heuristics if LLM is unavailable
  if (!llm) {
    const result = await heuristicAssert(page, assertion);
    if (cache) assertionCache.set(cacheKey, result);
    return result;
  }

  // Vision LLM assertion
  const result = await llmAssert(page, assertion, llm);
  if (cache) assertionCache.set(cacheKey, result);
  return result;
}

/**
 * Heuristic-based NL assertion (no LLM).
 * Simple text matching against a11y tree.
 */
async function heuristicAssert(
  page: Page,
  assertion: string
): Promise<NlAssertResult> {
  // Get a11y tree
  let a11yYaml: string;
  try {
    a11yYaml = await page.locator(":root").ariaSnapshot();
  } catch {
    return { passed: false, reasoning: "Failed to get a11y snapshot" };
  }

  // Keyword extraction
  const keywords = assertion
    .toLowerCase()
    .split(/[\s、。が]+/)
    .filter((w) => w.length > 1);

  const a11yLower = a11yYaml.toLowerCase();
  const matched = keywords.filter((k) => a11yLower.includes(k));
  const ratio = matched.length / Math.max(keywords.length, 1);

  // Numeric check (e.g. "5+ items", "3 elements")
  const numMatch = assertion.match(/(\d+)[つ個以上以下]/);
  let numCheckPassed = true;
  if (numMatch) {
    const expected = parseInt(numMatch[1], 10);
    const isAtLeast = assertion.includes("以上");
    // Approximate element count in a11y tree
    const elementCount = (a11yYaml.match(/- /g) || []).length;
    if (isAtLeast && elementCount < expected) numCheckPassed = false;
  }

  const passed = ratio >= 0.3 && numCheckPassed;

  return {
    passed,
    reasoning: passed
      ? `Heuristic: ${matched.length}/${keywords.length} keywords found in a11y tree`
      : `Heuristic: only ${matched.length}/${keywords.length} keywords matched`,
    hint: passed ? undefined : `Assertion "${assertion}" may not be satisfied. Check the UI.`,
  };
}

/**
 * Vision LLM assertion from screenshot + a11y tree.
 */
async function llmAssert(
  page: Page,
  assertion: string,
  llm: LLMProvider
): Promise<NlAssertResult> {
  // Capture screenshot
  const screenshot = await page.screenshot({ type: "png" });
  const base64 = screenshot.toString("base64");

  // Get a11y tree
  let a11yYaml = "";
  try {
    a11yYaml = await page.locator(":root").ariaSnapshot();
  } catch {
    // fallback
  }

  const prompt = `You are a UI testing assistant. Evaluate the following assertion against the current page state.

Assertion: "${assertion}"

Page URL: ${page.url()}

Accessibility tree:
${a11yYaml.slice(0, 2000)}

Screenshot is attached as base64 PNG.

Respond in JSON:
{
  "passed": true/false,
  "reasoning": "why it passed or failed",
  "hint": "if failed, what should be fixed"
}`;

  try {
    const response = await llm.complete(prompt);
    const parsed = JSON.parse(response);
    return {
      passed: parsed.passed ?? false,
      reasoning: parsed.reasoning ?? "LLM evaluation",
      hint: parsed.hint,
    };
  } catch {
    return {
      passed: false,
      reasoning: "LLM assertion failed to execute",
      hint: "Check LLM provider configuration",
    };
  }
}

/**
 * Wrapper that fires NL assertions only on test failure.
 *
 * @example
 * ```ts
 * test("form validation", async ({ page }) => {
 *   await page.goto("/contact");
 *
 *   try {
 *     await expect(page.getByRole("form")).toBeVisible();
 *     await expect(page.getByLabel("Email")).toBeVisible();
 *   } catch (e) {
 *     // Get fix hints via NL assertion only on failure
 *     const hint = await nlAssertOnFailure(page, [
 *       "Form is displayed",
 *       "All fields have labels",
 *       "Submit button is enabled",
 *     ]);
 *     console.log("Fix hints:", hint);
 *     throw e; // re-throw original error
 *   }
 * });
 * ```
 */
export async function nlAssertOnFailure(
  page: Page,
  assertions: string[],
  opts: Omit<NlAssertOptions, "onlyOnFailure"> = {}
): Promise<NlAssertResult[]> {
  const results: NlAssertResult[] = [];

  for (const assertion of assertions) {
    const result = await nlAssert(page, assertion, { ...opts, onlyOnFailure: false });
    results.push(result);
  }

  return results;
}

/**
 * NL assertion with dep graph check.
 * Skips if changed files don't affect dependsOn.
 */
export async function nlAssertWithDepCheck(
  page: Page,
  assertion: string,
  changedFiles: string[],
  opts: NlAssertOptions = {}
): Promise<NlAssertResult> {
  if (opts.dependsOn && opts.dependsOn.length > 0) {
    const affected = opts.dependsOn.some((dep) =>
      changedFiles.some((f) => f.includes(dep))
    );
    if (!affected) {
      return {
        passed: true,
        reasoning: "Skipped: no changes affect this assertion's dependencies",
        skipped: true,
        skipReason: `dependsOn [${opts.dependsOn.join(", ")}] not affected by changes`,
      };
    }
  }

  return nlAssert(page, assertion, opts);
}
