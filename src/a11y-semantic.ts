import type {
  A11yNode,
  A11yChange,
  A11yChangeType,
  A11yDiff,
  A11ySnapshot,
} from "./types.ts";

export const LANDMARK_ROLES = new Set([
  "banner",
  "complementary",
  "contentinfo",
  "form",
  "main",
  "navigation",
  "region",
  "search",
]);

export const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menu",
  "menubar",
  "menuitem",
  "option",
  "radio",
  "scrollbar",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "tabpanel",
  "textbox",
  "treeitem",
]);

/**
 * 2つの A11y ツリースナップショットを比較し、セマンティック差分を返す
 */
export function diffA11yTrees(
  baseline: A11ySnapshot,
  current: A11ySnapshot
): A11yDiff {
  const changes: A11yChange[] = [];
  diffNodes(baseline.tree, current.tree, "", changes);

  const landmarkChanges = changes.filter((c) => c.type === "landmark-changed");
  const hasRegression = changes.some((c) => c.severity === "error");

  return {
    testId: current.testId,
    changes,
    hasRegression,
    landmarkChanges,
    stats: {
      added: changes.filter((c) => c.type === "node-added").length,
      removed: changes.filter((c) => c.type === "node-removed").length,
      modified: changes.filter(
        (c) =>
          c.type !== "node-added" &&
          c.type !== "node-removed"
      ).length,
    },
  };
}

function diffNodes(
  before: A11yNode | undefined,
  after: A11yNode | undefined,
  path: string,
  changes: A11yChange[]
): void {
  const nodePath = path
    ? `${path} > ${nodeLabel(after ?? before!)}`
    : nodeLabel(after ?? before!);

  // ノード追加
  if (!before && after) {
    changes.push({
      type: isLandmark(after) ? "landmark-changed" : "node-added",
      path: nodePath,
      after: nodeSnapshot(after),
      severity: "info",
      description: `Added ${after.role}${after.name ? ` "${after.name}"` : ""}`,
    });
    // 子ノードも added として記録しない（親の追加に含める）
    return;
  }

  // ノード削除
  if (before && !after) {
    const severity = isLandmark(before)
      ? "error" // ランドマーク削除は重大
      : isInteractive(before)
        ? "error" // インタラクティブ要素の削除はリグレッション
        : "warning";

    changes.push({
      type: isLandmark(before) ? "landmark-changed" : "node-removed",
      path: nodePath,
      before: nodeSnapshot(before),
      severity,
      description: `Removed ${before.role}${before.name ? ` "${before.name}"` : ""}`,
    });
    return;
  }

  if (!before || !after) return;

  // role 変更
  if (before.role !== after.role) {
    changes.push({
      type: "role-changed",
      path: nodePath,
      before: { role: before.role },
      after: { role: after.role },
      severity: isInteractive(before) || isInteractive(after) ? "error" : "warning",
      description: `Role changed from "${before.role}" to "${after.role}"`,
    });
  }

  // name 変更
  if (before.name !== after.name) {
    const severity =
      isInteractive(before) && !after.name
        ? "error" // ラベル消失はリグレッション
        : "info";

    changes.push({
      type: "name-changed",
      path: nodePath,
      before: { name: before.name },
      after: { name: after.name },
      severity,
      description: after.name
        ? `Name changed from "${before.name}" to "${after.name}"`
        : `Name removed (was "${before.name}")`,
    });
  }

  // state 変更 (checked, disabled, expanded, pressed, selected)
  const stateKeys = ["checked", "disabled", "expanded", "pressed", "selected"] as const;
  for (const key of stateKeys) {
    if (before[key] !== after[key]) {
      changes.push({
        type: "state-changed",
        path: nodePath,
        before: { [key]: before[key] },
        after: { [key]: after[key] },
        severity: "info",
        description: `${key} changed from ${before[key]} to ${after[key]}`,
      });
    }
  }

  // 子ノードの差分 (順序ベースマッチング + role+name キーマッチング)
  const beforeChildren = before.children ?? [];
  const afterChildren = after.children ?? [];
  diffChildren(beforeChildren, afterChildren, nodePath, changes);
}

/**
 * 子ノードリストの差分。
 * 1) role+name 完全一致でマッチ
 * 2) 残りを位置ベース (同じインデックス) でマッチ → role/name 変更を検出
 * 3) 残りは追加/削除
 */
function diffChildren(
  beforeChildren: A11yNode[],
  afterChildren: A11yNode[],
  parentPath: string,
  changes: A11yChange[]
): void {
  const matched = new Set<number>(); // beforeChildren のマッチ済みインデックス
  const afterMatched = new Set<number>();

  // Pass 1: role+name 完全一致
  const beforeByKey = new Map<string, { node: A11yNode; index: number }[]>();
  for (let i = 0; i < beforeChildren.length; i++) {
    const key = childKey(beforeChildren[i]);
    const list = beforeByKey.get(key) ?? [];
    list.push({ node: beforeChildren[i], index: i });
    beforeByKey.set(key, list);
  }

  for (let ai = 0; ai < afterChildren.length; ai++) {
    const key = childKey(afterChildren[ai]);
    const candidates = beforeByKey.get(key);
    if (candidates && candidates.length > 0) {
      const match = candidates.shift()!;
      matched.add(match.index);
      afterMatched.add(ai);
      diffNodes(match.node, afterChildren[ai], parentPath, changes);
    }
  }

  // Pass 2: 位置ベースのマッチング (role or name が変わったケースを検出)
  const unmatchedBefore: { node: A11yNode; index: number }[] = [];
  for (let i = 0; i < beforeChildren.length; i++) {
    if (!matched.has(i)) unmatchedBefore.push({ node: beforeChildren[i], index: i });
  }
  const unmatchedAfter: { node: A11yNode; index: number }[] = [];
  for (let i = 0; i < afterChildren.length; i++) {
    if (!afterMatched.has(i)) unmatchedAfter.push({ node: afterChildren[i], index: i });
  }

  // role-only または name-only マッチで対応付け
  const stillUnmatchedBefore: typeof unmatchedBefore = [];
  const stillUnmatchedAfter = new Set(unmatchedAfter.map((_, i) => i));

  for (const b of unmatchedBefore) {
    let found = false;
    for (let j = 0; j < unmatchedAfter.length; j++) {
      if (!stillUnmatchedAfter.has(j)) continue;
      const a = unmatchedAfter[j];
      // role 一致 or name 一致 → 対応付け (変更として diff)
      if (
        b.node.role === a.node.role ||
        (b.node.name && b.node.name === a.node.name)
      ) {
        stillUnmatchedAfter.delete(j);
        diffNodes(b.node, a.node, parentPath, changes);
        found = true;
        break;
      }
    }
    if (!found) {
      stillUnmatchedBefore.push(b);
    }
  }

  // Pass 3: 残りは追加/削除
  for (const b of stillUnmatchedBefore) {
    diffNodes(b.node, undefined, parentPath, changes);
  }
  for (const j of stillUnmatchedAfter) {
    diffNodes(undefined, unmatchedAfter[j].node, parentPath, changes);
  }

  // 構造変化の検出 (子の数が大幅に変わった場合)
  const countDiff = Math.abs(afterChildren.length - beforeChildren.length);
  if (countDiff > 3 && countDiff / Math.max(beforeChildren.length, 1) > 0.3) {
    changes.push({
      type: "structure-changed",
      path: parentPath,
      before: { name: `${beforeChildren.length} children` },
      after: { name: `${afterChildren.length} children` },
      severity: "warning",
      description: `Structure changed significantly: ${beforeChildren.length} → ${afterChildren.length} children`,
    });
  }
}

function childKey(node: A11yNode): string {
  return `${node.role}:${node.name ?? ""}`;
}

function nodeLabel(node: A11yNode): string {
  const name = node.name ? `[${node.name}]` : "";
  return `${node.role}${name}`;
}

function nodeSnapshot(node: A11yNode): Partial<A11yNode> {
  return {
    role: node.role,
    name: node.name,
    ...(node.level !== undefined && { level: node.level }),
    ...(node.checked !== undefined && { checked: node.checked }),
    ...(node.disabled !== undefined && { disabled: node.disabled }),
    ...(node.expanded !== undefined && { expanded: node.expanded }),
  };
}

function isLandmark(node: A11yNode): boolean {
  return LANDMARK_ROLES.has(node.role);
}

function isInteractive(node: A11yNode): boolean {
  return INTERACTIVE_ROLES.has(node.role);
}

// ---- A11y Quality Checks ----

/**
 * A11y ツリーの品質チェック (単体、diff なし)
 */
export function checkA11yTree(tree: A11yNode): A11yIssue[] {
  const issues: A11yIssue[] = [];
  walkTree(tree, "", issues);
  return issues;
}

export interface A11yIssue {
  path: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

function walkTree(node: A11yNode, path: string, issues: A11yIssue[]): void {
  const nodePath = path ? `${path} > ${nodeLabel(node)}` : nodeLabel(node);

  // インタラクティブ要素にラベルがない
  if (isInteractive(node) && !node.name) {
    issues.push({
      path: nodePath,
      rule: "label-missing",
      severity: "error",
      message: `Interactive element "${node.role}" has no accessible name`,
    });
  }

  // 画像にaltがない (role=img で name なし)
  if (node.role === "img" && !node.name) {
    issues.push({
      path: nodePath,
      rule: "img-alt-missing",
      severity: "error",
      message: "Image has no accessible name (missing alt text)",
    });
  }

  // heading の level が飛んでいないかは親コンテキストが必要なので、
  // ここでは個別ノードのチェックのみ

  for (const child of node.children ?? []) {
    walkTree(child, nodePath, issues);
  }
}

/**
 * Playwright の page.accessibility.snapshot() の出力を A11ySnapshot に変換
 */
export function parsePlaywrightA11ySnapshot(
  testId: string,
  testTitle: string,
  raw: Record<string, unknown>
): A11ySnapshot {
  return {
    testId,
    testTitle,
    tree: normalizeA11yNode(raw),
  };
}

function normalizeA11yNode(raw: Record<string, unknown>): A11yNode {
  return {
    role: (raw.role as string) ?? "none",
    name: (raw.name as string) ?? "",
    ...(raw.level !== undefined && { level: raw.level as number }),
    ...(raw.value !== undefined && { value: raw.value as string }),
    ...(raw.description !== undefined && {
      description: raw.description as string,
    }),
    ...(raw.checked !== undefined && {
      checked: raw.checked as boolean | "mixed",
    }),
    ...(raw.disabled !== undefined && { disabled: raw.disabled as boolean }),
    ...(raw.expanded !== undefined && { expanded: raw.expanded as boolean }),
    ...(raw.pressed !== undefined && {
      pressed: raw.pressed as boolean | "mixed",
    }),
    ...(raw.selected !== undefined && { selected: raw.selected as boolean }),
    ...(raw.children && {
      children: (raw.children as Record<string, unknown>[]).map(
        normalizeA11yNode
      ),
    }),
  };
}
