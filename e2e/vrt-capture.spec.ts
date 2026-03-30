/**
 * VRT キャプチャテスト
 *
 * スクリーンショット + A11y スナップショットを収集する。
 * `vrt init` / `vrt capture` コマンドから呼ばれる。
 */
import { test, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.VRT_BASE_URL ?? "http://127.0.0.1:4174";
// CLI passes this env var; defaults to vrt/ root (not test-results/)
const OUTPUT_DIR = process.env.VRT_OUTPUT_DIR ?? process.cwd();
const MODE = process.env.VRT_MODE ?? "capture"; // "capture" | "baseline"

interface Route {
  name: string;
  path: string;
  waitFor?: string;
}

const routes: Route[] = [
  { name: "home", path: "/", waitFor: "main" },
  { name: "readme", path: "/readme", waitFor: "article" },
  { name: "files", path: "/files", waitFor: "main" },
  { name: "issues", path: "/issues", waitFor: "main" },
  { name: "pulls", path: "/pulls", waitFor: "main" },
];

test.describe("VRT Capture", () => {
  for (const route of routes) {
    test(`capture ${route.name}`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "networkidle" });

      if (route.waitFor) {
        await page.waitForSelector(route.waitFor, { timeout: 10_000 }).catch(() => {});
      }

      await page.waitForTimeout(500);

      const subDir = MODE === "baseline" ? "baselines" : "snapshots";
      const dir = join(OUTPUT_DIR, subDir);
      await mkdir(dir, { recursive: true });

      // Screenshot
      const screenshotPath = join(dir, `${route.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // A11y tree via CDP (Chromium only)
      let a11yTree: unknown = null;
      try {
        const client = await page.context().newCDPSession(page);
        const result = await client.send("Accessibility.getFullAXTree");
        // CDP returns flat node list; convert to tree
        a11yTree = cdpNodesToTree(result.nodes);
        await client.detach();
      } catch {
        // Fallback: use ariaSnapshot (YAML string)
        try {
          const yaml = await page.locator(":root").ariaSnapshot();
          a11yTree = { role: "document", name: route.name, ariaSnapshot: yaml };
        } catch {
          a11yTree = { role: "document", name: route.name, children: [] };
        }
      }

      const a11yPath = join(dir, `${route.name}.a11y.json`);
      await writeFile(a11yPath, JSON.stringify(a11yTree, null, 2));

      // Sanity: page rendered something
      const bodyText = await page.locator("body").innerText().catch(() => "");
      expect(bodyText.length).toBeGreaterThan(0);
    });
  }
});

/**
 * CDP Accessibility.getFullAXTree の flat ノードリストをツリーに変換
 */
function cdpNodesToTree(nodes: Array<{
  nodeId: string;
  parentId?: string;
  role?: { value: string };
  name?: { value: string };
  properties?: Array<{ name: string; value: { value: unknown } }>;
  childIds?: string[];
}>): unknown {
  if (!nodes || nodes.length === 0) {
    return { role: "document", name: "", children: [] };
  }

  const nodeMap = new Map<string, unknown>();
  const childMap = new Map<string, string[]>();

  for (const node of nodes) {
    const props: Record<string, unknown> = {};
    if (node.properties) {
      for (const p of node.properties) {
        props[p.name] = p.value?.value;
      }
    }

    const treeNode: Record<string, unknown> = {
      role: node.role?.value ?? "none",
      name: node.name?.value ?? "",
    };

    // Map common properties
    if (props.checked !== undefined) treeNode.checked = props.checked;
    if (props.disabled !== undefined) treeNode.disabled = props.disabled;
    if (props.expanded !== undefined) treeNode.expanded = props.expanded;
    if (props.selected !== undefined) treeNode.selected = props.selected;
    if (props.level !== undefined) treeNode.level = props.level;

    nodeMap.set(node.nodeId, treeNode);
    if (node.childIds) {
      childMap.set(node.nodeId, node.childIds);
    }
  }

  // Build tree from root
  function buildTree(nodeId: string): unknown {
    const node = nodeMap.get(nodeId) as Record<string, unknown> | undefined;
    if (!node) return null;

    const childIds = childMap.get(nodeId) ?? [];
    const children = childIds
      .map(buildTree)
      .filter((c): c is Record<string, unknown> => c !== null);

    if (children.length > 0) {
      node.children = children;
    }
    return node;
  }

  return buildTree(nodes[0].nodeId) ?? { role: "document", name: "", children: [] };
}
