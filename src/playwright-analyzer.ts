import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import type {
  PlaywrightReport,
  TestSuite,
  TestSpec,
  VrtSnapshot,
  Attachment,
} from "./types.ts";

export interface AnalyzedReport {
  snapshots: VrtSnapshot[];
  failedTests: FailedTest[];
  stats: ReportStats;
}

export interface FailedTest {
  testId: string;
  title: string;
  project: string;
  errors: string[];
  attachments: Attachment[];
}

export interface ReportStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
}

/**
 * Playwright JSON レポートを読み込み、構造化された VRT データに変換する
 */
export async function analyzeReport(
  reportPath: string
): Promise<AnalyzedReport> {
  const raw = await readFile(reportPath, "utf-8");
  const report: PlaywrightReport = JSON.parse(raw);

  const snapshots: VrtSnapshot[] = [];
  const failedTests: FailedTest[] = [];
  const stats: ReportStats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    duration: 0,
  };

  function walkSuites(suites: TestSuite[], prefix: string = "") {
    for (const suite of suites) {
      const suitePath = prefix ? `${prefix} > ${suite.title}` : suite.title;

      for (const spec of suite.specs) {
        processSpec(spec, suitePath);
      }

      if (suite.suites) {
        walkSuites(suite.suites, suitePath);
      }
    }
  }

  function processSpec(spec: TestSpec, suitePath: string) {
    for (const test of spec.tests) {
      stats.total++;
      stats.duration += test.duration;

      const testId = `${suitePath} > ${spec.title}[${test.projectName}]`;

      if (test.status === "skipped") {
        stats.skipped++;
        continue;
      }
      if (test.status === "flaky") stats.flaky++;
      if (test.status === "expected") stats.passed++;
      if (test.status === "unexpected") stats.failed++;

      // 各 attempt からスクリーンショットを抽出
      for (const attempt of test.results) {
        const screenshots = attempt.attachments.filter(
          (a) =>
            a.contentType === "image/png" && a.path && !a.name.includes("trace")
        );

        for (const screenshot of screenshots) {
          snapshots.push({
            testId,
            testTitle: spec.title,
            projectName: test.projectName,
            screenshotPath: screenshot.path!,
            status: test.status === "expected" ? "unchanged" : "changed",
          });
        }

        if (attempt.errors.length > 0) {
          failedTests.push({
            testId,
            title: spec.title,
            project: test.projectName,
            errors: attempt.errors.map((e) => e.message),
            attachments: attempt.attachments,
          });
        }
      }
    }
  }

  walkSuites(report.suites);

  return { snapshots, failedTests, stats };
}

/**
 * test-results ディレクトリからスクリーンショットファイルを収集し、
 * ベースラインとの対応関係を構築する
 */
export async function collectScreenshots(
  resultsDir: string,
  baselineDir: string
): Promise<VrtSnapshot[]> {
  const snapshots: VrtSnapshot[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".png") && !entry.name.includes("diff")) {
        const relPath = relative(resultsDir, fullPath);
        const baselinePath = join(baselineDir, relPath);
        let baselineExists = false;
        try {
          await stat(baselinePath);
          baselineExists = true;
        } catch {
          // baseline doesn't exist
        }

        snapshots.push({
          testId: relPath.replace(/\.png$/, ""),
          testTitle: basename(relPath, ".png"),
          projectName: relPath.split("/")[0] || "default",
          screenshotPath: fullPath,
          baselinePath: baselineExists ? baselinePath : undefined,
          status: baselineExists ? "unchanged" : "new",
        });
      }
    }
  }

  await walk(resultsDir);
  return snapshots;
}

/**
 * レポートの統計サマリを人間可読な文字列にする
 */
export function formatStats(stats: ReportStats): string {
  const lines = [
    `Total: ${stats.total} tests`,
    `Passed: ${stats.passed}`,
    `Failed: ${stats.failed}`,
    `Skipped: ${stats.skipped}`,
    `Flaky: ${stats.flaky}`,
    `Duration: ${(stats.duration / 1000).toFixed(1)}s`,
  ];
  return lines.join("\n");
}
