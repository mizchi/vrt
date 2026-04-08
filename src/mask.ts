/**
 * VRT Mask -- hide specific selectors before screenshotting.
 *
 * Uses visibility: hidden to preserve layout while hiding rendering.
 * Prevents false positives from dynamic content (counters, animations, ads).
 */
import type { Page } from "playwright";

/**
 * Inject mask styles into the page.
 * Sets visibility: hidden on target selectors including descendants.
 */
export async function applyMask(page: Page, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;

  const css = selectors
    .map((s) => `${s} { visibility: hidden !important; }`)
    .join("\n");

  await page.addStyleTag({ content: css });
}

/**
 * Parse selector array from CLI --mask flags.
 * Supports comma-separated or multiple --mask flags.
 *
 * --mask ".stars,.carousel"
 * --mask ".stars" --mask ".carousel"
 */
export function parseMaskSelectors(args: string[]): string[] {
  const selectors: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mask" && args[i + 1]) {
      for (const s of args[i + 1].split(",")) {
        const trimmed = s.trim();
        if (trimmed) selectors.push(trimmed);
      }
    }
  }
  return selectors;
}
