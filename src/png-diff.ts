import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { compareScreenshots } from "./heatmap.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import type { VrtSnapshot } from "./types.ts";

export interface PngDiffCliOptions {
  baselinePath: string;
  currentPath: string;
  outputDir: string;
  threshold: number;
  skipHeatmap: boolean;
  json: boolean;
}

class PngDiffCliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function formatPngDiffUsage(): string {
  return `vrt png-diff <baseline.png> <current.png>

Compare two existing PNG screenshots without launching Playwright.

Options:
  --output-dir <path>   Directory for generated heatmaps (default: test-results/png-diff)
  --threshold <0-1>     pixelmatch threshold (default: 0.1)
  --no-heatmap          Skip heatmap generation
  --json                Print JSON instead of a human-readable summary`;
}

export function parsePngDiffArgs(args: string[]): PngDiffCliOptions {
  const positional: string[] = [];
  let outputDir = join(process.cwd(), "test-results", "png-diff");
  let threshold = 0.1;
  let skipHeatmap = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--help":
      case "-h":
        throw new PngDiffCliError(formatPngDiffUsage(), 0);
      case "--output":
      case "--output-dir": {
        const value = args[++i];
        if (!value) throw new PngDiffCliError(`Missing value for ${arg}\n\n${formatPngDiffUsage()}`, 1);
        outputDir = value;
        break;
      }
      case "--threshold": {
        const value = args[++i];
        const parsed = value ? Number(value) : Number.NaN;
        if (!value || !Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
          throw new PngDiffCliError(`Invalid --threshold value: ${value ?? ""}\n\n${formatPngDiffUsage()}`, 1);
        }
        threshold = parsed;
        break;
      }
      case "--no-heatmap":
        skipHeatmap = true;
        break;
      case "--json":
        json = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new PngDiffCliError(`Unknown option: ${arg}\n\n${formatPngDiffUsage()}`, 1);
        }
        positional.push(arg);
        break;
    }
  }

  if (positional.length !== 2) {
    throw new PngDiffCliError(formatPngDiffUsage(), 1);
  }

  const [baselinePath, currentPath] = positional;
  return { baselinePath, currentPath, outputDir, threshold, skipHeatmap, json };
}

export async function runPngDiff(options: PngDiffCliOptions) {
  if (!options.skipHeatmap) {
    await mkdir(options.outputDir, { recursive: true });
  }

  const snapshot: VrtSnapshot = {
    testId: basename(options.currentPath, ".png") || "png-diff",
    testTitle: basename(options.currentPath),
    projectName: "vrt",
    screenshotPath: options.currentPath,
    baselinePath: options.baselinePath,
    status: "changed",
  };

  const diff = await compareScreenshots(snapshot, {
    outputDir: options.skipHeatmap ? undefined : options.outputDir,
    skipHeatmap: options.skipHeatmap,
    threshold: options.threshold,
  });
  if (!diff) {
    throw new Error("PNG diff requires both baseline and current screenshot paths");
  }

  const semantic = classifyVisualDiff(diff);
  return { diff, semantic };
}

export async function runPngDiffCli(cliArgs = process.argv.slice(2)) {
  try {
    const options = parsePngDiffArgs(cliArgs);
    const result = await runPngDiff(options);
    const output = {
      status: result.diff.diffPixels === 0 ? "pass" : "changed",
      baselinePath: options.baselinePath,
      currentPath: options.currentPath,
      diffPixels: result.diff.diffPixels,
      totalPixels: result.diff.totalPixels,
      diffRatio: result.diff.diffRatio,
      regions: result.diff.regions,
      heatmapPath: result.diff.heatmapPath,
      summary: result.semantic.summary,
      changes: result.semantic.changes,
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log("PNG Diff");
    console.log(`  baseline: ${output.baselinePath}`);
    console.log(`  current:  ${output.currentPath}`);
    console.log(`  diff:     ${(output.diffRatio * 100).toFixed(2)}% (${output.diffPixels} / ${output.totalPixels} px)`);
    console.log(`  regions:  ${output.regions.length}`);
    console.log(`  summary:  ${output.summary}`);
    if (output.heatmapPath) {
      console.log(`  heatmap:  ${output.heatmapPath}`);
    }
  } catch (error) {
    if (error instanceof PngDiffCliError) {
      if (error.exitCode === 0) {
        console.log(error.message);
      } else {
        console.error(error.message);
      }
      process.exit(error.exitCode);
    }
    throw error;
  }
}

if (process.argv[1]?.endsWith("png-diff.ts")) {
  runPngDiffCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
