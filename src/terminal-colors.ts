/** Shared ANSI terminal color codes and helpers */

export const DIM = "\x1b[2m";
export const RESET = "\x1b[0m";
export const GREEN = "\x1b[32m";
export const RED = "\x1b[31m";
export const YELLOW = "\x1b[33m";
export const CYAN = "\x1b[36m";
export const BOLD = "\x1b[1m";

export function hr(width = 72) {
  console.log(`${DIM}${"─".repeat(width)}${RESET}`);
}
