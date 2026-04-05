/** Shared CLI argument parsing helpers */

const args = process.argv.slice(2);

export function getArg(name: string, fallback: string): string;
export function getArg(name: string): string | undefined;
export function getArg(name: string, fallback?: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

export function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

export function getArgValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

/** Get positional args (not flags or flag values) */
export function getPositionalArgs(): string[] {
  return args.filter((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1]?.startsWith("--")));
}

export { args };
