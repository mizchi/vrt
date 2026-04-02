#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCss } from "./css-challenge-core.ts";
import { createLLMProvider } from "./llm-client.ts";
import {
  applyMigrationFixToHtml,
  buildMigrationFixLoopPrompt,
  parseMigrationFixResponse,
  resolveMigrationFixFromBaselineHtml,
  selectMigrationFixTarget,
  type MigrationCompareReport,
  type MigrationFix,
  type SelectedMigrationFixTarget,
} from "./migration-fix-loop-core.ts";

const args = process.argv.slice(2);

function getArg(name: string, fallback = ""): string {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const REPORT_PATH = resolve(getArg("report", join(process.cwd(), "test-results", "migration", "migration-report.json")));
const VARIANT_FILTER = getArg("variant");
const OUTPUT_PATH = getArg("output");
const PROMPT_OUT = getArg("prompt-out");
const RESPONSE_FILE = getArg("response-file");
const MANUAL_SELECTOR = getArg("selector");
const MANUAL_PROPERTY = getArg("property");
const MANUAL_VALUE = getArg("value");
const MANUAL_MEDIA = getArg("media", "none");
const DRY_RUN = hasFlag("dry-run");
const NO_RERUN = hasFlag("no-rerun");
const IN_PLACE = hasFlag("in-place");

async function main() {
  const report = JSON.parse(await readFile(REPORT_PATH, "utf-8")) as MigrationCompareReport;
  const target = selectMigrationFixTarget(report, { variant: VARIANT_FILTER || undefined });
  if (!target) {
    console.error("No non-zero migration diff with fix candidates found.");
    process.exit(1);
  }

  const baselinePath = resolveSourcePath(report.dir, report.baseline);
  const variantPath = resolveSourcePath(report.dir, target.variantFile);
  const [baselineHtml, variantHtml] = await Promise.all([
    readFile(baselinePath, "utf-8"),
    readFile(variantPath, "utf-8"),
  ]);
  const currentCss = extractCss(variantHtml);
  if (!currentCss) {
    console.error(`Could not find <style id="target-css"> in ${variantPath}`);
    process.exit(1);
  }

  const prompt = buildMigrationFixLoopPrompt({
    baselineFile: basename(baselinePath),
    variantFile: basename(variantPath),
    target,
    currentCss,
  });

  if (PROMPT_OUT) {
    const promptPath = resolve(PROMPT_OUT);
    await mkdir(dirname(promptPath), { recursive: true });
    await writeFile(promptPath, prompt);
  }

  const fix = await resolveFix({
    baselineHtml,
    prompt,
    target,
  });

  console.log();
  console.log(`Target: ${target.variantFile} @ ${target.viewport} (${target.viewportWidth}px)`);
  console.log(`Diff: ${(target.diffRatio * 100).toFixed(2)}% / ${target.diffPixels} px`);
  console.log(`Category: ${target.categorySummary}`);
  console.log(`Paint tree: ${target.paintTreeSummary}`);

  if (!fix) {
    console.log();
    console.log("No concrete fix could be resolved automatically.");
    if (!PROMPT_OUT) {
      console.log();
      console.log(prompt);
    } else {
      console.log(`Prompt: ${resolve(PROMPT_OUT)}`);
    }
    process.exit(0);
  }

  console.log();
  console.log(`Fix: ${fix.selector} { ${fix.property}: ${fix.value}; }${fix.mediaCondition ? ` @media ${fix.mediaCondition}` : ""}`);

  if (DRY_RUN) {
    console.log("Dry run: fix was not written.");
    return;
  }

  const nextHtml = applyMigrationFixToHtml(variantHtml, fix);
  if (nextHtml === variantHtml) {
    console.error("Resolved fix did not match any writable CSS rule in the current HTML.");
    process.exit(1);
  }

  const outputPath = resolveOutputPath(variantPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, nextHtml);
  console.log(`Wrote: ${outputPath}`);

  if (NO_RERUN) return;

  const rerunArgs = buildRerunArgs(report, baselinePath, outputPath);
  console.log();
  console.log(`Rerun: ${process.execPath} ${rerunArgs.join(" ")}`);
  await runCompare(rerunArgs);
}

async function resolveFix(input: {
  baselineHtml: string;
  prompt: string;
  target: SelectedMigrationFixTarget;
}): Promise<MigrationFix | null> {
  if (MANUAL_SELECTOR && MANUAL_PROPERTY && MANUAL_VALUE) {
    return {
      selector: MANUAL_SELECTOR,
      property: MANUAL_PROPERTY,
      value: MANUAL_VALUE,
      mediaCondition: MANUAL_MEDIA === "none" ? null : MANUAL_MEDIA,
    };
  }

  if (RESPONSE_FILE) {
    return parseMigrationFixResponse(await readFile(resolve(RESPONSE_FILE), "utf-8"));
  }

  for (const candidate of input.target.fixCandidates) {
    const fix = resolveMigrationFixFromBaselineHtml(input.baselineHtml, candidate);
    if (fix) return fix;
  }

  const llm = createLLMProvider();
  if (!llm || DRY_RUN) return null;
  const response = await llm.complete(input.prompt);
  return parseMigrationFixResponse(response);
}

function resolveSourcePath(dir: string | undefined, file: string): string {
  if (file.startsWith("/")) return file;
  return resolve(dir ?? ".", file);
}

function resolveOutputPath(variantPath: string): string {
  if (IN_PLACE) return variantPath;
  if (OUTPUT_PATH) return resolve(OUTPUT_PATH);
  const extension = variantPath.endsWith(".html") ? ".html" : "";
  const stem = extension ? basename(variantPath, extension) : basename(variantPath);
  return join(dirname(variantPath), `${stem}.fixloop${extension || ".html"}`);
}

function buildRerunArgs(
  report: MigrationCompareReport,
  baselinePath: string,
  variantPath: string,
): string[] {
  const compareScript = fileURLToPath(new URL("./migration-compare.ts", import.meta.url));
  const rerunArgs = [
    "--experimental-strip-types",
    compareScript,
    baselinePath,
    variantPath,
  ];
  if (report.approvalPath) rerunArgs.push("--approval", resolveSourcePath(report.dir, report.approvalPath));
  if (report.strict) rerunArgs.push("--strict");
  if (report.paintTree && !report.paintTree.enabled) rerunArgs.push("--no-paint-tree");
  return rerunArgs;
}

async function runCompare(compareArgs: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, compareArgs, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`migration-compare exited with code ${code ?? -1}`));
    });
    child.on("error", rejectPromise);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
