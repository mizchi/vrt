import type {
  QualityCheckResult,
  QualityCheckType,
  VrtSnapshot,
  VrtDiff,
  DepGraph,
  AffectedComponent,
} from "./types.ts";
import { decodePng, detectWhiteout, detectEmptyContent } from "./heatmap.ts";

/**
 * 全品質チェックを実行する
 */
export async function runQualityChecks(
  snapshots: VrtSnapshot[],
  diffs: VrtDiff[],
  graph?: DepGraph,
  affected?: AffectedComponent[]
): Promise<QualityCheckResult[]> {
  const results: QualityCheckResult[] = [];

  // 各スナップショットに対する個別チェック
  for (const snapshot of snapshots) {
    const snapshotChecks = await checkSnapshot(snapshot);
    results.push(...snapshotChecks);
  }

  // カバレッジチェック
  if (graph && affected) {
    results.push(checkCoverage(snapshots, affected));
  }

  // エラー状態チェック (diff がある場合)
  for (const diff of diffs) {
    if (diff.diffRatio > 0.5) {
      results.push({
        check: "layout-shift",
        passed: false,
        details: `Large visual change detected in "${diff.snapshot.testTitle}": ${(diff.diffRatio * 100).toFixed(1)}% of pixels changed. ${diff.regions.length} region(s) affected.`,
        severity: "warning",
      });
    }
  }

  return results;
}

/**
 * 個別スナップショットの品質チェック
 */
async function checkSnapshot(
  snapshot: VrtSnapshot
): Promise<QualityCheckResult[]> {
  const results: QualityCheckResult[] = [];

  try {
    const png = await decodePng(snapshot.screenshotPath);

    // 白飛び検出
    const whiteout = detectWhiteout(png);
    results.push({
      check: "whiteout",
      passed: !whiteout.isWhiteout,
      details: whiteout.isWhiteout
        ? `Whiteout detected in "${snapshot.testTitle}": ${(whiteout.whiteRatio * 100).toFixed(1)}% white pixels`
        : `OK: ${(whiteout.whiteRatio * 100).toFixed(1)}% white pixels`,
      severity: whiteout.isWhiteout ? "error" : "info",
    });

    // 空コンテンツ検出
    const empty = detectEmptyContent(png);
    results.push({
      check: "empty-content",
      passed: !empty.isEmpty,
      details: empty.isEmpty
        ? `Empty content detected in "${snapshot.testTitle}": only ${empty.uniqueColors} unique colors`
        : `OK: ${empty.uniqueColors} unique colors`,
      severity: empty.isEmpty ? "error" : "info",
    });

    // エラー状態検出 (赤い領域の割合)
    const errorState = detectErrorIndicators(png);
    results.push({
      check: "error-state",
      passed: !errorState.hasError,
      details: errorState.hasError
        ? `Possible error state in "${snapshot.testTitle}": ${errorState.reason}`
        : "OK: no error indicators detected",
      severity: errorState.hasError ? "warning" : "info",
    });
  } catch (err) {
    results.push({
      check: "whiteout",
      passed: false,
      details: `Failed to analyze screenshot "${snapshot.testTitle}": ${err}`,
      severity: "error",
    });
  }

  return results;
}

/**
 * エラー表示の視覚的指標を検出
 * - 大量の赤色ピクセル (エラーメッセージ、バリデーションエラー)
 * - 黄色/オレンジの警告色
 */
function detectErrorIndicators(data: {
  width: number;
  height: number;
  data: Uint8Array;
}): { hasError: boolean; reason: string } {
  const { width, height, data: pixels } = data;
  const total = width * height;
  let redCount = 0;
  let yellowCount = 0;

  const stride = Math.max(1, Math.floor(total / 20000));
  let sampled = 0;

  for (let i = 0; i < total; i += stride) {
    const offset = i * 4;
    const r = pixels[offset];
    const g = pixels[offset + 1];
    const b = pixels[offset + 2];
    sampled++;

    // 赤系 (エラー表示): R高, G低, B低
    if (r > 180 && g < 80 && b < 80) {
      redCount++;
    }
    // 黄/オレンジ系 (警告表示): R高, G中〜高, B低
    if (r > 200 && g > 120 && g < 220 && b < 60) {
      yellowCount++;
    }
  }

  const redRatio = redCount / sampled;
  const yellowRatio = yellowCount / sampled;

  if (redRatio > 0.05) {
    return {
      hasError: true,
      reason: `${(redRatio * 100).toFixed(1)}% red pixels (possible error state)`,
    };
  }
  if (yellowRatio > 0.1) {
    return {
      hasError: true,
      reason: `${(yellowRatio * 100).toFixed(1)}% yellow/orange pixels (possible warning state)`,
    };
  }

  return { hasError: false, reason: "" };
}

/**
 * VRT カバレッジ: 影響を受けるコンポーネントのうち、
 * VRT スナップショットが存在する割合を計算する
 */
function checkCoverage(
  snapshots: VrtSnapshot[],
  affected: AffectedComponent[]
): QualityCheckResult {
  if (affected.length === 0) {
    return {
      check: "coverage",
      passed: true,
      details: "No affected components to cover",
      severity: "info",
    };
  }

  // スナップショットの testTitle/testId にコンポーネント名が含まれるかで判定
  const snapshotNames = new Set(
    snapshots.flatMap((s) => [s.testTitle.toLowerCase(), s.testId.toLowerCase()])
  );

  const covered: string[] = [];
  const uncovered: string[] = [];

  for (const comp of affected) {
    // コンポーネントのファイル名 (拡張子なし) でマッチング
    const name = comp.node.id
      .replace(/\.[^.]+$/, "")
      .split("/")
      .pop()!
      .toLowerCase();

    const isCovered = [...snapshotNames].some(
      (sn) => sn.includes(name) || name.includes(sn)
    );

    if (isCovered) {
      covered.push(comp.node.id);
    } else {
      uncovered.push(comp.node.id);
    }
  }

  const ratio = covered.length / affected.length;
  const passed = ratio >= 0.8; // 80% カバレッジ閾値

  return {
    check: "coverage",
    passed,
    details: `VRT coverage: ${covered.length}/${affected.length} (${(ratio * 100).toFixed(0)}%) affected components covered.${uncovered.length > 0 ? ` Uncovered: ${uncovered.join(", ")}` : ""}`,
    severity: passed ? "info" : "warning",
  };
}
