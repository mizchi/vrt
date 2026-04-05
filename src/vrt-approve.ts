#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output, env } from "node:process";
import {
  mergeApprovalManifest,
  normalizeApprovalDecision,
  parseApprovalManifest,
  validateApprovalManifest,
  type ApprovalManifest,
  type ApprovalRule,
} from "./approval.ts";
import {
  appendApprovalHistory,
  buildApprovalHistoryEntry,
  getDefaultApprovalHistoryPath,
  type ApprovalHistoryEntry,
} from "./approval-history.ts";
import { getCssBenchApprovalSuggestionsPath } from "./css-challenge-fixtures.ts";
import { getArg, hasFlag } from "./cli-args.ts";
import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD } from "./terminal-colors.ts";

const FIXTURE = getArg("fixture", "page");
const INPUT_PATH = getArg("input", getCssBenchApprovalSuggestionsPath(FIXTURE));
const OUTPUT_PATH = getArg("output", join(process.cwd(), "approval.json"));
const HISTORY_PATH = getArg("history", getDefaultApprovalHistoryPath(OUTPUT_PATH));
const ACTOR = getArg("actor", env.GIT_AUTHOR_NAME ?? env.USER ?? env.LOGNAME ?? "unknown");
const ALL_APPROVE = hasFlag("all-approve");

async function main() {
  const suggestions = await loadManifest(INPUT_PATH);
  if (suggestions.rules.length === 0) {
    console.log(`  ${YELLOW}No approval suggestions found in ${INPUT_PATH}${RESET}`);
    return;
  }

  const existing = await loadExistingManifest(OUTPUT_PATH);
  const approvedRules: ApprovalRule[] = [];
  const historyEntries: ApprovalHistoryEntry[] = [];
  let rejected = 0;
  let skipped = 0;

  console.log();
  console.log(`${BOLD}${CYAN}Approval Review${RESET}`);
  console.log(`  ${DIM}Input: ${INPUT_PATH}${RESET}`);
  console.log(`  ${DIM}Fixture: ${FIXTURE}${RESET}`);
  console.log(`  ${DIM}Output: ${OUTPUT_PATH}${RESET}`);
  console.log(`  ${DIM}History: ${HISTORY_PATH}${RESET}`);
  console.log(`  ${DIM}Actor: ${ACTOR}${RESET}`);
  console.log(`  ${DIM}Suggestions: ${suggestions.rules.length}${RESET}`);
  console.log();

  if (ALL_APPROVE) {
    approvedRules.push(...suggestions.rules);
    historyEntries.push(...suggestions.rules.map((rule) => buildApprovalHistoryEntry({
      actor: ACTOR,
      action: "approve",
      sourcePath: INPUT_PATH,
      outputPath: OUTPUT_PATH,
      finalRule: rule,
    })));
  } else {
    const rl = readline.createInterface({ input, output });
    try {
      for (let i = 0; i < suggestions.rules.length; i++) {
        const rule = suggestions.rules[i];
        console.log(`${BOLD}[${i + 1}/${suggestions.rules.length}]${RESET} ${formatRule(rule)}`);
        if (rule.tolerance) {
          console.log(`  ${DIM}Tolerance: ${JSON.stringify(rule.tolerance)}${RESET}`);
        }
        console.log(`  ${DIM}Reason: ${rule.reason}${RESET}`);

        const decision = await promptDecision(rl);
        if (decision === "reject") {
          rejected++;
          historyEntries.push(buildApprovalHistoryEntry({
            actor: ACTOR,
            action: "reject",
            sourcePath: INPUT_PATH,
            outputPath: OUTPUT_PATH,
            finalRule: rule,
          }));
          console.log(`  ${RED}rejected${RESET}\n`);
          continue;
        }
        if (decision === "skip") {
          skipped++;
          historyEntries.push(buildApprovalHistoryEntry({
            actor: ACTOR,
            action: "skip",
            sourcePath: INPUT_PATH,
            outputPath: OUTPUT_PATH,
            finalRule: rule,
          }));
          console.log(`  ${YELLOW}skipped${RESET}\n`);
          continue;
        }

        const approved = await promptApprovedRule(rl, rule);
        approvedRules.push(approved);
        historyEntries.push(buildApprovalHistoryEntry({
          actor: ACTOR,
          action: "approve",
          sourcePath: INPUT_PATH,
          outputPath: OUTPUT_PATH,
          finalRule: approved,
        }));
        console.log(`  ${GREEN}approved${RESET}\n`);
      }
    } finally {
      rl.close();
    }
  }

  if (approvedRules.length === 0) {
    await appendApprovalHistory(historyEntries, HISTORY_PATH);
    console.log(`  ${YELLOW}No rules approved. Existing manifest left unchanged.${RESET}`);
    console.log(`  ${DIM}History: ${HISTORY_PATH}${RESET}`);
    return;
  }

  const merged = mergeApprovalManifest(existing, approvedRules);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  await appendApprovalHistory(historyEntries, HISTORY_PATH);

  console.log(`  ${GREEN}Approved:${RESET} ${approvedRules.length}`);
  console.log(`  ${RED}Rejected:${RESET} ${rejected}`);
  console.log(`  ${YELLOW}Skipped:${RESET} ${skipped}`);
  console.log(`  ${DIM}Wrote: ${OUTPUT_PATH}${RESET}`);
  console.log(`  ${DIM}History: ${HISTORY_PATH}${RESET}`);
}

async function loadManifest(path: string): Promise<ApprovalManifest> {
  return parseApprovalManifest(await readFile(path, "utf-8"));
}

async function loadExistingManifest(path: string): Promise<ApprovalManifest> {
  try {
    await access(path);
  } catch {
    return { rules: [] };
  }
  const raw = await readFile(path, "utf-8");
  return validateApprovalManifest(JSON.parse(raw));
}

async function promptDecision(rl: readline.Interface): Promise<"approve" | "reject" | "skip"> {
  while (true) {
    const answer = await rl.question("  Action [a]pprove / [r]eject / [s]kip: ");
    const normalized = normalizeApprovalDecision(answer);
    if (normalized) return normalized;
    console.log(`  ${YELLOW}Enter a, r, or s.${RESET}`);
  }
}

async function promptApprovedRule(
  rl: readline.Interface,
  rule: ApprovalRule,
): Promise<ApprovalRule> {
  const reason = await promptDefault(rl, "  Reason", rule.reason);
  const issue = await promptDefault(rl, "  Issue (optional)", rule.issue ?? "");
  const expires = await promptDefault(rl, "  Expires (optional)", rule.expires ?? "");
  return {
    ...rule,
    reason,
    issue: issue || undefined,
    expires: expires || undefined,
  };
}

async function promptDefault(rl: readline.Interface, label: string, current: string): Promise<string> {
  const answer = await rl.question(`${label}${current ? ` [${current}]` : ""}: `);
  return answer.trim() || current;
}

function formatRule(rule: ApprovalRule): string {
  const parts = [
    rule.selector,
    `{ ${rule.property ?? "*"} }`,
    rule.category,
    rule.changeType,
  ].filter(Boolean);
  return parts.join(" ");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
