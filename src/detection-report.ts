#!/usr/bin/env node
/**
 * Detection Pattern Report
 *
 * Generate aggregated detection pattern reports from accumulated JSONL data.
 *
 * Usage: npx tsx src/detection-report.ts
 */
import { readAllRecords, getDbStats } from "./detection-db.ts";
import { isOutOfScope } from "./detection-classify.ts";
import { getBenchHistoryStats, readBenchHistory } from "./bench-history.ts";
import { DIM, RESET, GREEN, RED, YELLOW, CYAN, BOLD, hr as _hr } from "./terminal-colors.ts";

function hr() { _hr(76); }

function fmtRate(n: number, total: number): string {
  if (total === 0) return `${DIM}n/a${RESET}`;
  const pct = ((n / total) * 100).toFixed(1);
  const color = n === total ? GREEN : n >= total * 0.8 ? GREEN : n >= total * 0.5 ? YELLOW : RED;
  return `${color}${pct}%${RESET} ${DIM}(${n}/${total})${RESET}`;
}

function bar(n: number, total: number, width = 20): string {
  if (total === 0) return "";
  const filled = Math.round((n / total) * width);
  return `${GREEN}${"█".repeat(filled)}${DIM}${"░".repeat(width - filled)}${RESET}`;
}

// ---- Main ----

async function main() {
  const records = await readAllRecords();
  const benchHistory = await readBenchHistory();

  if (records.length === 0 && benchHistory.length === 0) {
    console.log(`\n  ${YELLOW}No data found.${RESET} Run ${BOLD}just css-bench${RESET} first.\n`);
    return;
  }
  const stats = getDbStats(records);
  const benchStats = getBenchHistoryStats(benchHistory);

  console.log();
  console.log(`${BOLD}${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║  CSS VRT Detection Pattern Report                                       ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════════════════════════════════╝${RESET}`);
  console.log();

  // ---- Overview ----
  console.log(`  ${BOLD}Overview${RESET}`);
  console.log(`    Total records:    ${stats.totalRecords}`);
  console.log(`    Unique runs:      ${stats.uniqueRuns}`);
  console.log(`    Bench runs:       ${benchStats.totalRuns}`);
  if (stats.dateRange) {
    console.log(`    Date range:       ${stats.dateRange.first.slice(0, 10)} → ${stats.dateRange.last.slice(0, 10)}`);
  }
  if (records.length > 0) {
    const allDetected = records.filter((r) => r.detected).length;
    console.log(`    Detection rate:   ${fmtRate(allDetected, stats.totalRecords)}`);
    const scoped = records.filter((r) => !isOutOfScope(r.property));
    const scopedDetected = scoped.filter((r) => r.detected).length;
    if (scoped.length < records.length) {
      const outCount = records.length - scoped.length;
      console.log(`    Scoped rate:      ${fmtRate(scopedDetected, scoped.length)} ${DIM}(excl. ${outCount} animation)${RESET}`);
    }
  }
  const fixtures = new Set(records.map((r) => (r as any).fixture ?? "page"));
  if (benchHistory.length > 0) {
    for (const record of benchHistory) fixtures.add(record.fixture);
  }
  if (fixtures.size > 1) {
    console.log(`    Fixtures:         ${[...fixtures].join(", ")}`);
  }
  console.log();

  if (benchHistory.length > 0) {
    console.log(`  ${BOLD}Benchmark History${RESET}`);
    for (const [backend, summary] of [...benchStats.byBackend.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(
        `    ${backend.padEnd(20)} latest ${summary.latest.avgMsPerTrial.toFixed(1).padStart(7)} ms/trial` +
        `  detect ${fmtRate(summary.latest.eitherDetected, summary.latest.trials)}` +
        `  ${DIM}(runs=${summary.count}, best=${summary.bestAvgMsPerTrial.toFixed(1)} ms)${RESET}`,
      );
    }
    if (benchStats.comparableSpeedups.length > 0) {
      console.log();
      console.log(`  ${BOLD}Latest Prescanner Speedups${RESET}`);
      for (const speedup of benchStats.comparableSpeedups.slice(0, 5)) {
        console.log(
          `    ${speedup.fixture.padEnd(20)} ${speedup.speedup.toFixed(2)}x` +
          `  ${DIM}(prescanner ${speedup.prescannerAvgMsPerTrial.toFixed(1)} ms / chromium ${speedup.chromiumAvgMsPerTrial.toFixed(1)} ms, trials=${speedup.trials})${RESET}`,
        );
      }
      console.log();
    } else {
      console.log();
    }
  }

  // ---- By Backend ----
  const backends = new Set(records.map((r) => (r as any).backend ?? "chromium"));
  if (backends.size > 1) {
    console.log(`  ${BOLD}Detection by Backend${RESET}`);
    for (const be of backends) {
      const beRecords = records.filter((r) => ((r as any).backend ?? "chromium") === be);
      const det = beRecords.filter((r) => r.detected).length;
      console.log(`    ${be.padEnd(20)} ${fmtRate(det, beRecords.length)}  ${bar(det, beRecords.length)}`);
    }
    console.log();
  }

  // ---- By Fixture ----
  if (records.length > 0 && fixtures.size > 1) {
    console.log(`  ${BOLD}Detection by Fixture${RESET}`);
    for (const fix of fixtures) {
      const fixRecords = records.filter((r) => ((r as any).fixture ?? "page") === fix);
      if (fixRecords.length === 0) continue;
      const det = fixRecords.filter((r) => r.detected).length;
      console.log(`    ${fix.padEnd(20)} ${fmtRate(det, fixRecords.length)}  ${bar(det, fixRecords.length)}`);
    }
    console.log();
  }

  // ---- By Category ----
  if (records.length === 0) {
    hr();
    console.log();
    return;
  }

  console.log(`  ${BOLD}Detection by Property Category${RESET}`);
  console.log(`    ${"Category".padEnd(14)} ${"Total".padStart(5)}  ${"Rate".padStart(8)}  ${"Bar".padStart(22)}`);
  for (const [cat, data] of [...stats.byCategory.entries()].sort((a, b) => (b[1].detected / b[1].total) - (a[1].detected / a[1].total))) {
    console.log(`    ${cat.padEnd(14)} ${String(data.total).padStart(5)}  ${fmtRate(data.detected, data.total).padStart(22)}  ${bar(data.detected, data.total)}`);
  }
  console.log();

  // ---- By Selector Type ----
  console.log(`  ${BOLD}Detection by Selector Type${RESET}`);
  console.log(`    ${"Type".padEnd(16)} ${"Total".padStart(5)}  ${"Rate".padStart(8)}  ${"Bar".padStart(22)}`);
  for (const [typ, data] of [...stats.bySelectorType.entries()].sort((a, b) => (b[1].detected / b[1].total) - (a[1].detected / a[1].total))) {
    console.log(`    ${typ.padEnd(16)} ${String(data.total).padStart(5)}  ${fmtRate(data.detected, data.total).padStart(22)}  ${bar(data.detected, data.total)}`);
  }
  console.log();

  // ---- Viewport Analysis ----
  const vpWidths = new Set<number>();
  for (const r of records) for (const v of r.viewports) vpWidths.add(v.width);

  if (vpWidths.size > 1) {
    console.log(`  ${BOLD}Detection by Viewport${RESET}`);
    for (const w of [...vpWidths].sort((a, b) => b - a)) {
      const label = w > 1000 ? "desktop" : "mobile";
      const vpDetected = records.filter((r) => {
        const vr = r.viewports.find((v) => v.width === w);
        return vr && (vr.visualDiffDetected || vr.a11yDiffDetected);
      }).length;
      console.log(`    ${`${label} (${w}px)`.padEnd(20)} ${fmtRate(vpDetected, records.length)}`);
    }

    // Multi-viewport bonus
    const desktopOnly = records.filter((r) => {
      const desktop = r.viewports.find((v) => v.width > 1000);
      const mobile = r.viewports.find((v) => v.width <= 500);
      return desktop && (desktop.visualDiffDetected || desktop.a11yDiffDetected) &&
        mobile && !(mobile.visualDiffDetected || mobile.a11yDiffDetected);
    }).length;
    const mobileOnly = records.filter((r) => {
      const desktop = r.viewports.find((v) => v.width > 1000);
      const mobile = r.viewports.find((v) => v.width <= 500);
      return mobile && (mobile.visualDiffDetected || mobile.a11yDiffDetected) &&
        desktop && !(desktop.visualDiffDetected || desktop.a11yDiffDetected);
    }).length;
    console.log(`    ${DIM}desktop-only: ${desktopOnly} | mobile-only: ${mobileOnly}${RESET}`);
    console.log();
  }

  // ---- Undetected Reasons ----
  if (stats.byReason.size > 0) {
    console.log(`  ${BOLD}${YELLOW}Undetected Reasons${RESET}`);
    const undetectedTotal = records.filter((r) => !r.detected).length;
    for (const [reason, count] of [...stats.byReason.entries()].sort((a, b) => b[1] - a[1])) {
      const pct = ((count / undetectedTotal) * 100).toFixed(0);
      const examples = records.filter((r) => r.undetectedReason === reason).slice(0, 3);
      console.log(`    ${reason.padEnd(20)} ${String(count).padStart(3)} ${DIM}(${pct}%)${RESET}`);
      for (const ex of examples) {
        console.log(`      ${DIM}${ex.selector} { ${ex.property}: ${ex.value} }${RESET}`);
      }
    }
    console.log();
  }

  // ---- Property Ranking ----
  const byProperty = new Map<string, { total: number; detected: number; examples: string[] }>();
  for (const r of records) {
    const key = r.property;
    const entry = byProperty.get(key) ?? { total: 0, detected: 0, examples: [] };
    entry.total++;
    if (r.detected) entry.detected++;
    if (entry.examples.length < 2) entry.examples.push(`${r.selector}{${r.property}:${r.value}}`);
    byProperty.set(key, entry);
  }

  // Always detected
  const alwaysDetected = [...byProperty.entries()]
    .filter(([, d]) => d.total >= 2 && d.detected === d.total)
    .sort((a, b) => b[1].total - a[1].total);
  if (alwaysDetected.length > 0) {
    console.log(`  ${BOLD}${GREEN}Always Detected${RESET} ${DIM}(100% rate, n>=2)${RESET}`);
    for (const [prop, d] of alwaysDetected.slice(0, 10)) {
      console.log(`    ${prop.padEnd(20)} ${DIM}n=${d.total}${RESET}`);
    }
    console.log();
  }

  // Never detected
  const neverDetected = [...byProperty.entries()]
    .filter(([, d]) => d.total >= 2 && d.detected === 0)
    .sort((a, b) => b[1].total - a[1].total);
  if (neverDetected.length > 0) {
    console.log(`  ${BOLD}${RED}Never Detected${RESET} ${DIM}(0% rate, n>=2)${RESET}`);
    for (const [prop, d] of neverDetected.slice(0, 10)) {
      console.log(`    ${prop.padEnd(20)} ${DIM}n=${d.total}  ${d.examples[0]}${RESET}`);
    }
    console.log();
  }

  // Flaky (sometimes detected)
  const flaky = [...byProperty.entries()]
    .filter(([, d]) => d.total >= 3 && d.detected > 0 && d.detected < d.total)
    .sort((a, b) => (a[1].detected / a[1].total) - (b[1].detected / b[1].total));
  if (flaky.length > 0) {
    console.log(`  ${BOLD}${YELLOW}Flaky Detection${RESET} ${DIM}(inconsistent, n>=3)${RESET}`);
    for (const [prop, d] of flaky.slice(0, 10)) {
      console.log(`    ${prop.padEnd(20)} ${fmtRate(d.detected, d.total)}`);
    }
    console.log();
  }

  hr();
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
