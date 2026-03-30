import type {
  VrtDiff,
  DiffRegion,
  VisualSemanticChange,
  VisualSemanticDiff,
  VisualChangeType,
} from "./types.ts";

/**
 * VRT ピクセル差分を視覚的セマンティクスに変換する
 *
 * ピクセル差分の各領域を分析し、「何が変わったか」を推測する:
 * - text-change: テキスト領域の変化 (横長、小さい領域)
 * - color-change: 色のみの変化 (形状は同一)
 * - layout-shift: 要素の位置移動 (大きな領域、連動する差分)
 * - element-added/removed: 新しい要素の出現/消失
 * - icon-change: 小さい正方形の領域
 */
export function classifyVisualDiff(diff: VrtDiff): VisualSemanticDiff {
  const changes: VisualSemanticChange[] = [];

  for (const region of diff.regions) {
    const classified = classifyRegion(region, diff);
    changes.push(classified);
  }

  // 連動する layout-shift をグループ化
  const grouped = groupLayoutShifts(changes);

  return {
    testId: diff.snapshot.testId,
    changes: grouped,
    summary: summarizeChanges(grouped),
  };
}

function classifyRegion(
  region: DiffRegion,
  diff: VrtDiff
): VisualSemanticChange {
  const area = region.width * region.height;
  const aspectRatio = region.width / Math.max(region.height, 1);
  const density = region.diffPixelCount / area;
  const globalRatio = region.diffPixelCount / diff.totalPixels;

  // 小さい正方形 → アイコン変更
  if (
    area < 4096 && // 64x64 以下
    aspectRatio > 0.5 &&
    aspectRatio < 2.0
  ) {
    return {
      type: "icon-change",
      region,
      confidence: 0.7,
      description: `Small square region changed at (${region.x}, ${region.y})`,
    };
  }

  // 横長で薄い密度 → テキスト変更
  if (aspectRatio > 3.0 && density < 0.5) {
    return {
      type: "text-change",
      region,
      confidence: 0.6,
      description: `Text-like region changed at (${region.x}, ${region.y}), ${region.width}x${region.height}`,
    };
  }

  // 高密度で小〜中領域 → 色変更
  if (density > 0.7 && area < diff.totalPixels * 0.3) {
    return {
      type: "color-change",
      region,
      confidence: 0.65,
      description: `Color change in region (${region.x}, ${region.y}), ${region.width}x${region.height}, ${(density * 100).toFixed(0)}% density`,
    };
  }

  // 大きな領域 → レイアウトシフト
  if (globalRatio > 0.05) {
    return {
      type: "layout-shift",
      region,
      confidence: 0.5,
      description: `Layout shift at (${region.x}, ${region.y}), ${region.width}x${region.height}, ${(globalRatio * 100).toFixed(1)}% of total`,
    };
  }

  // 新規要素の出現 (高密度 + 中程度のサイズ)
  if (density > 0.5 && area > 1024) {
    return {
      type: "element-added",
      region,
      confidence: 0.4,
      description: `New element appeared at (${region.x}, ${region.y}), ${region.width}x${region.height}`,
    };
  }

  // デフォルト: element-added
  return {
    type: "element-added",
    region,
    confidence: 0.3,
    description: `Change at (${region.x}, ${region.y}), ${region.width}x${region.height}`,
  };
}

/**
 * Y座標が近い layout-shift をグループ化する
 * (同じ行で複数領域が同時にずれた場合 = 1つのレイアウトシフト)
 */
function groupLayoutShifts(
  changes: VisualSemanticChange[]
): VisualSemanticChange[] {
  const layoutShifts = changes.filter((c) => c.type === "layout-shift");
  const others = changes.filter((c) => c.type !== "layout-shift");

  if (layoutShifts.length <= 1) return changes;

  // Y座標でソートし、近いものをグループ化
  layoutShifts.sort((a, b) => a.region.y - b.region.y);

  const groups: VisualSemanticChange[][] = [];
  let currentGroup: VisualSemanticChange[] = [layoutShifts[0]];

  for (let i = 1; i < layoutShifts.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = layoutShifts[i];
    // Y座標が64px以内なら同じグループ
    if (Math.abs(curr.region.y - prev.region.y) < 64) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  // 各グループを1つのchangeにマージ
  const merged = groups.map((group): VisualSemanticChange => {
    if (group.length === 1) return group[0];

    const minX = Math.min(...group.map((c) => c.region.x));
    const minY = Math.min(...group.map((c) => c.region.y));
    const maxX = Math.max(
      ...group.map((c) => c.region.x + c.region.width)
    );
    const maxY = Math.max(
      ...group.map((c) => c.region.y + c.region.height)
    );
    const totalDiff = group.reduce(
      (sum, c) => sum + c.region.diffPixelCount,
      0
    );

    return {
      type: "layout-shift",
      region: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        diffPixelCount: totalDiff,
      },
      confidence: Math.max(...group.map((c) => c.confidence)),
      description: `Layout shift spanning ${group.length} regions at y=${minY}-${maxY}`,
    };
  });

  return [...others, ...merged];
}

function summarizeChanges(changes: VisualSemanticChange[]): string {
  const byType = new Map<VisualChangeType, number>();
  for (const c of changes) {
    byType.set(c.type, (byType.get(c.type) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [type, count] of byType) {
    parts.push(`${count} ${type}`);
  }
  return parts.join(", ") || "no changes";
}
